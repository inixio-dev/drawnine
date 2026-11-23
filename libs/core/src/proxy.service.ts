import { Inject, Injectable } from '@nestjs/common';
import {
  type ArtArchive,
  ArtArchiveReader,
  type ArtAsset,
  normalizeCardName,
} from '@drawnine/assets';
import {
  type DecklistEntry,
  parseDecklist,
  type ParsedDecklist,
} from '@drawnine/decklist-parser';
import {
  type CardImage,
  CARDS_PER_PAGE,
  computeGridLayout,
  DEFAULT_LAYOUT_OPTIONS,
  renderPdf,
} from '@drawnine/pdf-renderer';
import {
  type CardIdentifier,
  detectImageFormat,
  getCardImages,
  identifierKey,
  ScryfallClient,
  type ScryfallCard,
  ScryfallError,
  type ScryfallLanguage,
} from '@drawnine/scryfall-client';
import {
  CardsNotFoundError,
  EmptyDecklistError,
  InvalidDecklistError,
  TooManyCardsError,
} from './errors.js';
import { mapLimit } from './map-limit.js';
import { coreMessages } from './messages.js';
import { printOrder } from './print-order.js';
import type {
  ProxyOptions,
  ProxyRequest,
  ProxyResult,
  ProxyServiceOptions,
  ProxyWarning,
} from './types.js';

export const DEFAULT_PROXY_OPTIONS: ProxyOptions = {
  ...DEFAULT_LAYOUT_OPTIONS,
  printBothFaces: true,
  lang: 'en',
};

export const PROXY_SERVICE_OPTIONS = Symbol('PROXY_SERVICE_OPTIONS');
export const DEFAULT_MAX_CARDS = 600;
const IMAGE_DOWNLOAD_CONCURRENCY = 4;
const LOCALIZE_CONCURRENCY = 4;

/** Where one printed face comes from. */
type FaceSource =
  | { kind: 'art'; asset: ArtAsset }
  | { kind: 'scryfall'; url: string; faceName: string };

/** Orchestrates parser → Scryfall/custom art → PDF. */
@Injectable()
export class ProxyService {
  constructor(
    private readonly scryfall: ScryfallClient,
    private readonly artReader: ArtArchiveReader,
    @Inject(PROXY_SERVICE_OPTIONS)
    private readonly serviceOptions: ProxyServiceOptions = {
      maxCards: DEFAULT_MAX_CARDS,
    },
  ) {}

  parse(decklist: string): ParsedDecklist {
    return parseDecklist(decklist);
  }

  async generate(request: ProxyRequest): Promise<ProxyResult> {
    const { onProgress } = request;
    const options: ProxyOptions = {
      ...DEFAULT_PROXY_OPTIONS,
      ...request.options,
    };
    // Fail fast on impossible layouts before any network work.
    computeGridLayout(0, options);

    const parsed = this.parse(request.decklist);
    if (parsed.errors.length > 0) throw new InvalidDecklistError(parsed.errors);
    if (parsed.entries.length === 0) throw new EmptyDecklistError();
    this.assertCardCount(
      parsed.entries.reduce((sum, e) => sum + e.quantity, 0),
    );

    const warnings: ProxyWarning[] = [];
    let art: ArtArchive | undefined;
    if (request.art) {
      onProgress?.({ stage: 'reading-art' });
      art = await this.artReader.read(request.art);
      warnings.push(
        ...art.warnings.map((w) => ({
          code: w.code,
          message: w.message,
          file: w.fileName,
        })),
      );
    }
    const usedArt = new Set<string>();
    const findArt = (...names: string[]): ArtAsset | undefined => {
      for (const name of names) {
        const asset = art?.assets.get(normalizeCardName(name));
        if (asset) {
          usedArt.add(asset.key);
          return asset;
        }
      }
      return undefined;
    };

    // 1. Custom art for the whole card takes precedence over Scryfall.
    const faces = new Map<DecklistEntry, FaceSource[]>();
    const pending: DecklistEntry[] = [];
    for (const entry of parsed.entries) {
      const asset = findArt(entry.name);
      if (asset) faces.set(entry, [{ kind: 'art', asset }]);
      else pending.push(entry);
    }

    // 2. Resolve the rest with Scryfall; per-face custom art still wins.
    // The commander goes first: its edition is the preferred printing for
    // every other card without an explicit set code.
    onProgress?.({ stage: 'resolving-cards', total: pending.length });
    const isCommander = (e: DecklistEntry) => e.section === 'commander';
    const cards = await this.resolveCards(pending.filter(isCommander));
    const preferredSet = await this.commanderSet(parsed.entries, cards);
    const others = await this.resolveCards(
      pending.filter((e) => !isCommander(e)),
      preferredSet,
    );
    for (const [entry, card] of others) cards.set(entry, card);
    const notFound = pending.filter((entry) => !cards.has(entry));
    if (notFound.length > 0) {
      throw new CardsNotFoundError([...new Set(notFound.map((e) => e.name))]);
    }
    if (options.lang !== 'en') {
      onProgress?.({ stage: 'localizing-cards', total: pending.length });
      const unavailable = await this.localizeCards(cards, options.lang);
      for (const name of unavailable) {
        warnings.push({
          code: 'language-unavailable',
          message: coreMessages.languageUnavailable,
          card: name,
        });
      }
    }

    for (const entry of pending) {
      const card = cards.get(entry) as ScryfallCard;
      const images = getCardImages(card, { bothFaces: options.printBothFaces });
      if (images.length === 0) {
        warnings.push({
          code: 'missing-image',
          message: coreMessages.missingImage,
          card: entry.name,
        });
        continue;
      }
      faces.set(
        entry,
        images.map((image, i): FaceSource => {
          const asset = findArt(
            image.faceName,
            ...(i === 0 ? [card.name] : []),
          );
          return asset
            ? { kind: 'art', asset }
            : { kind: 'scryfall', url: image.url, faceName: image.faceName };
        }),
      );
    }

    const cardCount = [...faces].reduce(
      (sum, [entry, sources]) => sum + entry.quantity * sources.length,
      0,
    );
    this.assertCardCount(cardCount);

    // 3. Download every distinct Scryfall image once.
    const urls = [
      ...new Set(
        [...faces.values()]
          .flat()
          .flatMap((f) => (f.kind === 'scryfall' ? [f.url] : [])),
      ),
    ];
    let done = 0;
    onProgress?.({ stage: 'downloading-images', done, total: urls.length });
    const downloaded = new Map<string, CardImage>();
    await mapLimit(urls, IMAGE_DOWNLOAD_CONCURRENCY, async (url) => {
      const bytes = await this.scryfall.getImage(url);
      const format = detectImageFormat(bytes);
      if (!format)
        throw new ScryfallError(`Unexpected image format from ${url}`);
      downloaded.set(url, { key: url, bytes, format });
      onProgress?.({
        stage: 'downloading-images',
        done: ++done,
        total: urls.length,
      });
    });

    // 4. Lay out copies in decklist order with the commander first, faces of
    // each copy together.
    const images: CardImage[] = [];
    for (const entry of printOrder(parsed.entries)) {
      const sources = faces.get(entry) ?? [];
      const copy = sources.map((source): CardImage => {
        if (source.kind === 'art') {
          const { asset } = source;
          return {
            key: `art:${asset.key}`,
            bytes: asset.bytes,
            format: asset.format,
          };
        }
        return downloaded.get(source.url) as CardImage;
      });
      for (let i = 0; i < entry.quantity; i++) images.push(...copy);
    }

    for (const asset of art?.assets.values() ?? []) {
      if (!usedArt.has(asset.key)) {
        warnings.push({
          code: 'unused-art',
          message: coreMessages.unusedArt,
          file: asset.fileName,
        });
      }
    }

    onProgress?.({ stage: 'rendering', cards: images.length });
    const pdf = await renderPdf(images, options, {
      noticeText: coreMessages.pdfNotice,
      title: coreMessages.pdfTitle,
    });

    return {
      pdf,
      pageCount: Math.ceil(images.length / CARDS_PER_PAGE),
      cardCount: images.length,
      warnings,
    };
  }

  private assertCardCount(count: number): void {
    if (count > this.serviceOptions.maxCards) {
      throw new TooManyCardsError(count, this.serviceOptions.maxCards);
    }
  }

  /**
   * Set code of the (first) commander's printing, or undefined without a
   * commander. A commander with custom art is still looked up for its set,
   * but not finding it is not an error.
   */
  private async commanderSet(
    entries: readonly DecklistEntry[],
    resolved: ReadonlyMap<DecklistEntry, ScryfallCard>,
  ): Promise<string | undefined> {
    const commander = entries.find((e) => e.section === 'commander');
    if (!commander) return undefined;
    const card =
      resolved.get(commander) ??
      (await this.resolveCards([commander])).get(commander);
    return card?.set;
  }

  /**
   * Replaces each resolved card with its printing in `lang`, in place. An
   * explicit set code in the decklist pins the printing; otherwise any
   * printing in that language is accepted. Returns the decklist names left
   * in English.
   */
  private async localizeCards(
    cards: Map<DecklistEntry, ScryfallCard>,
    lang: ScryfallLanguage,
  ): Promise<string[]> {
    const lookups = new Map<string, Promise<ScryfallCard | undefined>>();
    const unavailable = new Set<DecklistEntry>();
    await mapLimit([...cards], LOCALIZE_CONCURRENCY, async ([entry, card]) => {
      const samePrintingOnly = entry.setCode !== undefined;
      const key = `${card.id}:${samePrintingOnly}`;
      let lookup = lookups.get(key);
      if (!lookup) {
        lookup = this.scryfall.getLocalizedPrint(card, lang, {
          samePrintingOnly,
        });
        lookups.set(key, lookup);
      }
      const localized = await lookup;
      if (localized) cards.set(entry, localized);
      else unavailable.add(entry);
    });
    const names = [...cards.keys()]
      .filter((e) => unavailable.has(e))
      .map((e) => e.name);
    return [...new Set(names)];
  }

  /**
   * Looks cards up in rounds, from most to least specific identifier, so a
   * wrong Arena set code or a DFC full name still resolves by name.
   */
  private async resolveCards(
    entries: readonly DecklistEntry[],
    preferredSet?: string,
  ): Promise<Map<DecklistEntry, ScryfallCard>> {
    const resolved = new Map<DecklistEntry, ScryfallCard>();
    const candidates = new Map(
      entries.map((e) => [e, identifierCandidates(e, preferredSet)]),
    );

    for (let round = 0; ; round++) {
      const requests = entries.flatMap((entry) => {
        const id = resolved.has(entry)
          ? undefined
          : candidates.get(entry)?.[round];
        return id ? [{ entry, id }] : [];
      });
      if (requests.length === 0) break;

      const result = await this.scryfall.getCollection(
        requests.map((r) => r.id),
      );
      const byKey = new Map(
        result.found.map((m) => [identifierKey(m.identifier), m.card]),
      );
      for (const { entry, id } of requests) {
        const card = byKey.get(identifierKey(id));
        if (card) resolved.set(entry, card);
      }
    }
    return resolved;
  }
}

/**
 * Scryfall's collection endpoint finds double-faced cards by their front face
 * name but not by `A // B`, while split cards work with either: use the front
 * face first and the full name as a fallback. Without an explicit set code,
 * `preferredSet` (the commander's edition) is tried before any printing.
 */
function identifierCandidates(
  entry: DecklistEntry,
  preferredSet?: string,
): CardIdentifier[] {
  const list: CardIdentifier[] = [];
  const front = entry.name.split(' // ')[0] || entry.name;
  const set = entry.setCode?.toLowerCase() ?? preferredSet;
  if (entry.setCode && entry.collectorNumber) {
    list.push({
      set: entry.setCode.toLowerCase(),
      collector_number: entry.collectorNumber,
    });
  }
  if (set) list.push({ name: front, set });
  list.push({ name: front });
  if (front !== entry.name) list.push({ name: entry.name });
  return list;
}
