import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { zipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  ArtArchiveError,
  CardsNotFoundError,
  CoreModule,
  EmptyDecklistError,
  InvalidDecklistError,
  LayoutError,
  type ProxyProgress,
  ProxyService,
  ScryfallError,
  TooManyCardsError,
} from '@app/core';
import { ArtArchiveReader } from '@app/assets';
import {
  type CardIdentifier,
  type CollectionResult,
  identifierKey,
  ScryfallClient,
  type ScryfallCard,
} from '@app/scryfall-client';
import { StorageModule } from '@app/storage';

const card = (
  name: string,
  extra: Partial<ScryfallCard> = {},
): ScryfallCard => ({
  id: name,
  name,
  set: 'tst',
  collector_number: '1',
  layout: 'normal',
  image_uris: { png: `https://img.test/${encodeURIComponent(name)}.png` },
  ...extra,
});

const CATALOG: ScryfallCard[] = [
  card('Lightning Bolt', { set: 'm10', collector_number: '146' }),
  card('Island'),
  card('Fire // Ice', { layout: 'split' }),
  card('Delver of Secrets // Insectile Aberration', {
    layout: 'transform',
    image_uris: undefined,
    card_faces: [
      {
        name: 'Delver of Secrets',
        image_uris: { png: 'https://img.test/delver-front.png' },
      },
      {
        name: 'Insectile Aberration',
        image_uris: { png: 'https://img.test/delver-back.png' },
      },
    ],
  }),
  card('Imageless Card', { image_uris: undefined }),
  card("Atraxa, Praetors' Voice", { set: 'c16', collector_number: '28' }),
  card('Sol Ring', { set: 'lea' }),
  card('Sol Ring', {
    id: 'Sol Ring c16',
    set: 'c16',
    image_uris: { png: 'https://img.test/sol-ring-c16.png' },
  }),
];

/** Printings in other languages, returned by the getLocalizedPrint fake. */
const LOCALIZED: ScryfallCard[] = [
  card('Lightning Bolt', {
    id: 'bolt-es',
    lang: 'es',
    set: 'm10',
    collector_number: '146',
    image_uris: { png: 'https://img.test/bolt-es.png' },
  }),
  card('Delver of Secrets // Insectile Aberration', {
    id: 'delver-es',
    lang: 'es',
    layout: 'transform',
    image_uris: undefined,
    card_faces: [
      {
        name: 'Delver of Secrets',
        image_uris: { png: 'https://img.test/delver-front-es.png' },
      },
      {
        name: 'Insectile Aberration',
        image_uris: { png: 'https://img.test/delver-back-es.png' },
      },
    ],
  }),
];

/** Fake that answers like Scryfall: by set+number, by name+set, or by any face name. */
function findInCatalog(id: CardIdentifier): ScryfallCard | undefined {
  return CATALOG.find((c) => {
    if ('collector_number' in id)
      return c.set === id.set && c.collector_number === id.collector_number;
    if ('id' in id) return c.id === id.id;
    if ('set' in id && c.set !== id.set) return false;
    const names = [c.name, ...(c.card_faces ?? []).map((f) => f.name)];
    return names.some((n) => n.toLowerCase() === id.name.toLowerCase());
  });
}

describe('ProxyService', () => {
  let png: Uint8Array;
  let artPng: Uint8Array;
  let scryfall: {
    getCollection: ReturnType<
      typeof vi.fn<
        (ids: readonly CardIdentifier[]) => Promise<CollectionResult>
      >
    >;
    getImage: ReturnType<typeof vi.fn<(url: string) => Promise<Uint8Array>>>;
    getLocalizedPrint: ReturnType<
      typeof vi.fn<ScryfallClient['getLocalizedPrint']>
    >;
  };
  let service: ProxyService;

  const pageCountOf = async (pdf: Uint8Array) =>
    (await PDFDocument.load(pdf)).getPageCount();

  beforeAll(async () => {
    const make = async (r: number) =>
      new Uint8Array(
        await sharp({
          create: {
            width: 745,
            height: 1040,
            channels: 3,
            background: { r, g: 0, b: 0 },
          },
        })
          .png()
          .toBuffer(),
      );
    png = await make(10);
    artPng = await make(250);
  });

  beforeEach(() => {
    scryfall = {
      getCollection: vi.fn(async (ids) => {
        const found = ids.flatMap((identifier) => {
          const c = findInCatalog(identifier);
          return c ? [{ identifier, card: c }] : [];
        });
        const foundKeys = new Set(
          found.map((f) => identifierKey(f.identifier)),
        );
        return {
          found,
          notFound: ids.filter((id) => !foundKeys.has(identifierKey(id))),
        };
      }),
      getImage: vi.fn(async () => png),
      getLocalizedPrint: vi.fn(async (c, lang) =>
        LOCALIZED.find(
          (l) => l.lang === lang && l.name === c.name && l.set === c.set,
        ),
      ),
    };
    service = new ProxyService(
      scryfall as unknown as ScryfallClient,
      new ArtArchiveReader(),
      { maxCards: 100 },
    );
  });

  it('delegates parsing to decklist-parser', () => {
    expect(service.parse('4 Opt').entries).toHaveLength(1);
  });

  it('generates a PDF with one page per 9 cards', async () => {
    const result = await service.generate({
      decklist: '4 Lightning Bolt\n6 Island',
    });
    expect(result.cardCount).toBe(10);
    expect(result.pageCount).toBe(2);
    expect(await pageCountOf(result.pdf)).toBe(2);
    expect(result.warnings).toEqual([]);
  });

  it('downloads each distinct image once', async () => {
    await service.generate({
      decklist: '4 Lightning Bolt\n4 Island\n\n4 Lightning Bolt',
    });
    expect(scryfall.getImage).toHaveBeenCalledTimes(2);
  });

  it('prints both faces of double-faced cards', async () => {
    const result = await service.generate({
      decklist: '4 Delver of Secrets',
    });
    expect(result.cardCount).toBe(8);
    expect(scryfall.getImage.mock.calls.map(([u]) => u).sort()).toEqual([
      'https://img.test/delver-back.png',
      'https://img.test/delver-front.png',
    ]);
  });

  it('prints only the front face when printBothFaces is false', async () => {
    const result = await service.generate({
      decklist: '4 Delver of Secrets',
      options: { printBothFaces: false },
    });
    expect(result.cardCount).toBe(4);
  });

  it('looks up `//` names by front face first, then by full name', async () => {
    await service.generate({
      decklist: '1 Delver of Secrets // Insectile Aberration',
    });
    expect(scryfall.getCollection.mock.calls.map(([ids]) => ids)).toEqual([
      [{ name: 'Delver of Secrets' }],
    ]);

    scryfall.getCollection.mockClear();
    await service.generate({ decklist: '1 Fire // Ice' });
    expect(scryfall.getCollection.mock.calls.map(([ids]) => ids)).toEqual([
      [{ name: 'Fire' }],
      [{ name: 'Fire // Ice' }],
    ]);
  });

  it('resolves names with `//` (split cards and full DFC names)', async () => {
    const result = await service.generate({
      decklist: '2 Fire // Ice\n1 Delver of Secrets // Insectile Aberration',
    });
    expect(result.cardCount).toBe(2 + 2);
  });

  it('falls back to the name when the Arena set code is unknown', async () => {
    const result = await service.generate({
      decklist: '4 Lightning Bolt (DAR) 999',
    });
    expect(result.cardCount).toBe(4);
    const rounds = scryfall.getCollection.mock.calls.map(([ids]) => ids);
    expect(rounds).toEqual([
      [{ set: 'dar', collector_number: '999' }],
      [{ name: 'Lightning Bolt', set: 'dar' }],
      [{ name: 'Lightning Bolt' }],
    ]);
  });

  it('uses set + collector number when available', async () => {
    await service.generate({ decklist: '4 Lightning Bolt (M10) 146' });
    expect(scryfall.getCollection).toHaveBeenCalledTimes(1);
  });

  it('throws InvalidDecklistError when the decklist has errors', async () => {
    await expect(
      service.generate({ decklist: 'Lightning Bolt' }),
    ).rejects.toBeInstanceOf(InvalidDecklistError);
    expect(scryfall.getCollection).not.toHaveBeenCalled();
  });

  it('throws EmptyDecklistError for an empty decklist', async () => {
    await expect(
      service.generate({ decklist: '\n# nothing\n' }),
    ).rejects.toBeInstanceOf(EmptyDecklistError);
  });

  it('throws TooManyCardsError above the limit, counting DFC faces', async () => {
    await expect(
      service.generate({ decklist: '101 Island' }),
    ).rejects.toBeInstanceOf(TooManyCardsError);
    await expect(
      service.generate({ decklist: '60 Delver of Secrets' }),
    ).rejects.toBeInstanceOf(TooManyCardsError);
  });

  it('throws CardsNotFoundError listing unknown cards', async () => {
    await expect(
      service.generate({
        decklist: '4 Lightning Bolt\n2 Not A Card\n1 Not A Card',
      }),
    ).rejects.toMatchObject({ names: ['Not A Card'] });
    await expect(
      service.generate({ decklist: '1 Nope' }),
    ).rejects.toBeInstanceOf(CardsNotFoundError);
  });

  it('rejects impossible layouts before calling Scryfall', async () => {
    await expect(
      service.generate({
        decklist: '1 Island',
        options: { gapMm: 10, bleedMm: 3 },
      }),
    ).rejects.toBeInstanceOf(LayoutError);
    expect(scryfall.getCollection).not.toHaveBeenCalled();
  });

  it('warns and skips cards without images', async () => {
    const result = await service.generate({
      decklist: '1 Imageless Card\n1 Island',
    });
    expect(result.cardCount).toBe(1);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'missing-image',
        card: 'Imageless Card',
      }),
    ]);
  });

  it('propagates Scryfall errors', async () => {
    scryfall.getCollection.mockRejectedValueOnce(new ScryfallError('down'));
    await expect(
      service.generate({ decklist: '1 Island' }),
    ).rejects.toBeInstanceOf(ScryfallError);
  });

  it('rejects unexpected image bytes', async () => {
    scryfall.getImage.mockResolvedValueOnce(new Uint8Array([1, 2, 3]));
    await expect(
      service.generate({ decklist: '1 Island' }),
    ).rejects.toBeInstanceOf(ScryfallError);
  });

  it('reports progress', async () => {
    const events: ProxyProgress[] = [];
    await service.generate({
      decklist: '2 Island',
      onProgress: (e) => events.push(e),
    });
    expect(events.map((e) => e.stage)).toEqual([
      'resolving-cards',
      'downloading-images',
      'downloading-images',
      'rendering',
    ]);
  });

  describe('language', () => {
    it('does not look up translations for English (the default)', async () => {
      await service.generate({ decklist: '1 Lightning Bolt' });
      expect(scryfall.getLocalizedPrint).not.toHaveBeenCalled();
    });

    it('prints cards in the requested language', async () => {
      const result = await service.generate({
        decklist: '4 Lightning Bolt\n1 Delver of Secrets',
        options: { lang: 'es' },
      });
      expect(result.warnings).toEqual([]);
      expect(scryfall.getImage.mock.calls.map(([u]) => u).sort()).toEqual([
        'https://img.test/bolt-es.png',
        'https://img.test/delver-back-es.png',
        'https://img.test/delver-front-es.png',
      ]);
    });

    it('falls back to English with a warning when unavailable', async () => {
      const result = await service.generate({
        decklist: '4 Lightning Bolt\n2 Island\n\n1 Island',
        options: { lang: 'es' },
      });
      expect(result.cardCount).toBe(7);
      expect(scryfall.getImage.mock.calls.map(([u]) => u).sort()).toEqual([
        'https://img.test/Island.png',
        'https://img.test/bolt-es.png',
      ]);
      expect(result.warnings).toEqual([
        expect.objectContaining({
          code: 'language-unavailable',
          card: 'Island',
        }),
      ]);
    });

    it('looks up each card once and pins printings with a set code', async () => {
      await service.generate({
        decklist: '2 Island\n\n1 Island\n1 Lightning Bolt (M10)',
        options: { lang: 'fr' },
      });
      expect(
        scryfall.getLocalizedPrint.mock.calls.map(([c, lang, opts]) => [
          c.name,
          lang,
          opts,
        ]),
      ).toEqual([
        ['Island', 'fr', { samePrintingOnly: false }],
        ['Lightning Bolt', 'fr', { samePrintingOnly: true }],
      ]);
    });

    it('keeps custom art over translated images', async () => {
      await service.generate({
        decklist: '1 Lightning Bolt\n1 Delver of Secrets',
        options: { lang: 'es' },
        art: zipSync({ 'Lightning Bolt.png': artPng }),
      });
      expect(scryfall.getImage.mock.calls.map(([u]) => u)).not.toContain(
        'https://img.test/bolt-es.png',
      );
    });

    it('reports the localizing stage', async () => {
      const events: ProxyProgress[] = [];
      await service.generate({
        decklist: '1 Island',
        options: { lang: 'de' },
        onProgress: (e) => events.push(e),
      });
      expect(events.map((e) => e.stage)).toContain('localizing-cards');
    });
  });

  describe('commander', () => {
    const deck = [
      'Commander',
      "1 Atraxa, Praetors' Voice",
      '',
      'Deck',
      '1 Sol Ring',
      '4 Island',
    ].join('\n');

    it("prefers the commander's edition for the other cards", async () => {
      const result = await service.generate({ decklist: deck });
      expect(result.cardCount).toBe(6);
      expect(scryfall.getCollection.mock.calls.map(([ids]) => ids)).toEqual([
        [{ name: "Atraxa, Praetors' Voice" }],
        [
          { name: 'Sol Ring', set: 'c16' },
          { name: 'Island', set: 'c16' },
        ],
        [{ name: 'Island' }],
      ]);
      expect(scryfall.getImage).toHaveBeenCalledWith(
        'https://img.test/sol-ring-c16.png',
      );
    });

    it('keeps an explicit set code over the commander edition', async () => {
      await service.generate({
        decklist:
          "Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Sol Ring (LEA)",
      });
      expect(scryfall.getCollection.mock.calls[1]?.[0]).toEqual([
        { name: 'Sol Ring', set: 'lea' },
      ]);
    });

    it('still uses the edition of a commander with custom art', async () => {
      await service.generate({
        decklist: deck,
        art: zipSync({ "Atraxa, Praetors' Voice.png": artPng }),
      });
      expect(scryfall.getCollection.mock.calls[1]?.[0]).toEqual([
        { name: 'Sol Ring', set: 'c16' },
        { name: 'Island', set: 'c16' },
      ]);
    });

    it('ignores an unknown commander that has custom art', async () => {
      const result = await service.generate({
        decklist: 'Commander\n1 Homebrew Legend\n\nDeck\n1 Island',
        art: zipSync({ 'Homebrew Legend.png': artPng }),
      });
      expect(result.cardCount).toBe(2);
      expect(scryfall.getCollection.mock.calls.map(([ids]) => ids)).toEqual([
        [{ name: 'Homebrew Legend' }],
        [{ name: 'Island' }],
      ]);
    });
  });

  describe('custom art', () => {
    const zipOf = (files: Record<string, Uint8Array>) => zipSync(files);

    it('prefers custom art over Scryfall and skips the lookup', async () => {
      const result = await service.generate({
        decklist: '4 Lightning Bolt\n1 Island',
        art: zipOf({ 'lightning bolt.png': artPng }),
      });
      expect(result.cardCount).toBe(5);
      expect(scryfall.getCollection.mock.calls[0]?.[0]).toEqual([
        { name: 'Island' },
      ]);
      expect(scryfall.getImage).toHaveBeenCalledTimes(1);
    });

    it('needs no Scryfall call when every card has custom art', async () => {
      const result = await service.generate({
        decklist: '2 Fire // Ice',
        art: zipOf({ 'Fire_Ice.png': artPng }),
      });
      expect(result.cardCount).toBe(2);
      expect(scryfall.getCollection).not.toHaveBeenCalled();
    });

    it('matches custom art per face of a double-faced card', async () => {
      await service.generate({
        decklist: '1 Delver of Secrets',
        art: zipOf({ 'Insectile Aberration.png': artPng }),
      });
      expect(scryfall.getImage.mock.calls.map(([u]) => u)).toEqual([
        'https://img.test/delver-front.png',
      ]);
    });

    it('surfaces archive warnings and unused art', async () => {
      const result = await service.generate({
        decklist: '1 Island',
        art: zipOf({ '../evil.png': artPng, 'Unused Card.png': artPng }),
      });
      expect(result.warnings.map((w) => [w.code, w.file])).toEqual([
        ['unsafe-path', '../evil.png'],
        ['unused-art', 'Unused Card.png'],
      ]);
    });

    it('propagates invalid archives', async () => {
      await expect(
        service.generate({
          decklist: '1 Island',
          art: new Uint8Array([1, 2, 3]),
        }),
      ).rejects.toBeInstanceOf(ArtArchiveError);
    });
  });
});

describe('CoreModule', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'drawnine-core-'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('wires ProxyService with configuration', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ PROXY_MAX_CARDS: '1', ART_ZIP_MAX_ENTRIES: '5' })],
        }),
        StorageModule.forRoot({ driver: 'disk', root }),
        CoreModule,
      ],
    }).compile();

    const service = moduleRef.get(ProxyService);
    expect(service).toBeInstanceOf(ProxyService);
    expect(moduleRef.get(ArtArchiveReader).limits.maxEntries).toBe(5);
    await expect(
      service.generate({ decklist: '2 Island' }),
    ).rejects.toBeInstanceOf(TooManyCardsError);
  });
});
