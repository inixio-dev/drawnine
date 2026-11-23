import { createHash } from 'node:crypto';
import {
  hasPrintableImage,
  identifierKey,
  matchesIdentifier,
  normalizeForMatch,
} from './card-utils.js';
import {
  BASE_BACKOFF_MS,
  COLLECTION_BATCH_SIZE,
  DEFAULT_MAX_RETRIES,
  DEFAULT_METADATA_TTL_MS,
  MIN_REQUEST_INTERVAL_MS,
  SCRYFALL_BASE_URL,
} from './constants.js';
import { ScryfallError, ScryfallRateLimitError } from './errors.js';
import { RateLimiter } from './rate-limiter.js';
import type {
  CardIdentifier,
  CollectionMatch,
  CollectionResult,
  LocalizedPrintOptions,
  ScryfallCache,
  ScryfallCard,
  ScryfallClientOptions,
  ScryfallLanguage,
} from './types.js';

interface CollectionResponse {
  data: ScryfallCard[];
  not_found?: CardIdentifier[];
}

interface SearchResponse {
  data: ScryfallCard[];
}

interface CachedCard {
  fetchedAt: number;
  /** null caches a lookup that found nothing. */
  card: ScryfallCard | null;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class ScryfallClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly maxRetries: number;
  private readonly metadataTtlMs: number;
  private readonly cache?: ScryfallCache;
  private readonly limiter: RateLimiter;
  /** Images requested during this client's lifetime: never fetched twice. */
  private readonly images = new Map<string, Promise<Uint8Array>>();

  constructor(private readonly options: ScryfallClientOptions) {
    this.baseUrl = (options.baseUrl ?? SCRYFALL_BASE_URL).replace(/\/$/, '');
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? Date.now;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.metadataTtlMs = options.metadataTtlMs ?? DEFAULT_METADATA_TTL_MS;
    this.cache = options.cache;
    this.limiter = new RateLimiter(
      MIN_REQUEST_INTERVAL_MS,
      this.now,
      this.sleep,
    );
  }

  /** Resolves card metadata in batches of COLLECTION_BATCH_SIZE, rate limited and cached. */
  async getCollection(
    identifiers: readonly CardIdentifier[],
  ): Promise<CollectionResult> {
    const unique = new Map<string, CardIdentifier>();
    for (const id of identifiers) unique.set(identifierKey(id), id);

    const found: CollectionMatch[] = [];
    const notFound: CardIdentifier[] = [];
    const misses: CardIdentifier[] = [];

    for (const [key, identifier] of unique) {
      const card = (await this.readCachedCard(key))?.card;
      if (card) found.push({ identifier, card });
      else misses.push(identifier);
    }

    for (let i = 0; i < misses.length; i += COLLECTION_BATCH_SIZE) {
      const batch = misses.slice(i, i + COLLECTION_BATCH_SIZE);
      const response = await this.request(`${this.baseUrl}/cards/collection`, {
        method: 'POST',
        headers: {
          ...this.headers('application/json'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ identifiers: batch }),
      });
      const body = await parseJson<CollectionResponse>(response);
      const matches = pairBatch(batch, body);
      for (const identifier of batch) {
        const card = matches.get(identifierKey(identifier));
        if (card) {
          found.push({ identifier, card });
          await this.writeCachedCard(identifierKey(identifier), card);
        } else {
          notFound.push(identifier);
        }
      }
    }

    return { found, notFound };
  }

  /**
   * The same card printed in `lang`, with a real image, or undefined if there
   * is none. Tries the same printing first and then, unless
   * `samePrintingOnly`, the most recent printing in that language.
   */
  async getLocalizedPrint(
    card: ScryfallCard,
    lang: ScryfallLanguage,
    options: LocalizedPrintOptions = {},
  ): Promise<ScryfallCard | undefined> {
    if (card.lang === lang && hasPrintableImage(card)) return card;

    const set = encodeURIComponent(card.set.toLowerCase());
    const number = encodeURIComponent(card.collector_number);
    const samePrint = await this.cachedLookup(
      `print:${card.set.toLowerCase()}:${card.collector_number}:${lang}`,
      async () =>
        this.getJsonOrUndefined<ScryfallCard>(
          `${this.baseUrl}/cards/${set}/${number}/${lang}`,
        ),
    );
    if (samePrint && hasPrintableImage(samePrint)) return samePrint;
    if (options.samePrintingOnly) return undefined;

    const query = card.oracle_id
      ? `oracleid:${card.oracle_id} lang:${lang}`
      : `!"${card.name.replace(/"/g, '')}" lang:${lang}`;
    const params = new URLSearchParams({
      q: query,
      unique: 'prints',
      order: 'released',
      dir: 'desc',
      include_multilingual: 'true',
    });
    return this.cachedLookup(
      `search:${card.oracle_id ?? normalizeForMatch(card.name)}:${lang}`,
      async () => {
        const body = await this.getJsonOrUndefined<SearchResponse>(
          `${this.baseUrl}/cards/search?${params.toString()}`,
        );
        return body?.data.find((c) => c.lang === lang && hasPrintableImage(c));
      },
    );
  }

  /** Downloads an image, using the cache so the same URL is fetched once. */
  getImage(url: string): Promise<Uint8Array> {
    let pending = this.images.get(url);
    if (!pending) {
      pending = this.loadImage(url);
      pending.catch(() => this.images.delete(url));
      this.images.set(url, pending);
    }
    return pending;
  }

  private async loadImage(url: string): Promise<Uint8Array> {
    const key = `images/${sha256(url)}`;
    const cached = await this.cache?.get(key);
    if (cached) return cached;

    // *.scryfall.io image hosts are not rate limited, so skip the limiter.
    const response = await this.request(
      url,
      { headers: this.headers('image/png,image/jpeg;q=0.9,*/*;q=0.5') },
      false,
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    await this.cache?.set(key, bytes);
    return bytes;
  }

  private headers(accept: string): Record<string, string> {
    return { 'User-Agent': this.options.userAgent, Accept: accept };
  }

  /** fetch with rate limiting and retries (429, 5xx, network errors). */
  private async request(
    url: string,
    init: RequestInit,
    limit = true,
  ): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      if (limit) await this.limiter.wait();
      const isLast = attempt >= this.maxRetries;

      let response: Response;
      try {
        response = await this.fetchFn(url, init);
      } catch (error) {
        if (isLast) {
          throw new ScryfallError(
            `Network error requesting ${url}`,
            undefined,
            {
              cause: error,
            },
          );
        }
        await this.sleep(backoff(attempt));
        continue;
      }

      if (response.ok) return response;

      if (response.status === 429) {
        if (isLast) {
          throw new ScryfallRateLimitError('Scryfall rate limit exceeded', 429);
        }
        await this.sleep(retryAfterMs(response) ?? backoff(attempt));
        continue;
      }
      if (response.status >= 500 && !isLast) {
        await this.sleep(backoff(attempt));
        continue;
      }
      throw new ScryfallError(
        `Scryfall responded ${response.status} for ${url}`,
        response.status,
      );
    }
  }

  /** GET a JSON resource; 404 (not found) resolves to undefined. */
  private async getJsonOrUndefined<T>(url: string): Promise<T | undefined> {
    try {
      const response = await this.request(url, {
        headers: this.headers('application/json'),
      });
      return await parseJson<T>(response);
    } catch (error) {
      if (error instanceof ScryfallError && error.status === 404) {
        return undefined;
      }
      throw error;
    }
  }

  /** Runs a lookup through the metadata cache, caching misses too. */
  private async cachedLookup(
    key: string,
    lookup: () => Promise<ScryfallCard | undefined>,
  ): Promise<ScryfallCard | undefined> {
    const cached = await this.readCachedCard(key);
    if (cached) return cached.card ?? undefined;
    const card = await lookup();
    await this.writeCachedCard(key, card ?? null);
    return card;
  }

  private async readCachedCard(key: string): Promise<CachedCard | undefined> {
    const raw = await this.cache?.get(cardCacheKey(key));
    if (!raw) return undefined;
    try {
      const entry = JSON.parse(new TextDecoder().decode(raw)) as CachedCard;
      if (this.now() - entry.fetchedAt > this.metadataTtlMs) return undefined;
      return entry;
    } catch {
      return undefined;
    }
  }

  private async writeCachedCard(
    key: string,
    card: ScryfallCard | null,
  ): Promise<void> {
    const entry: CachedCard = { fetchedAt: this.now(), card };
    await this.cache?.set(
      cardCacheKey(key),
      new TextEncoder().encode(JSON.stringify(entry)),
    );
  }
}

/**
 * Maps each requested identifier to its card. Scryfall returns found cards in
 * request order, so pair by position when counts agree; otherwise match by
 * identifier fields.
 */
function pairBatch(
  batch: readonly CardIdentifier[],
  body: CollectionResponse,
): Map<string, ScryfallCard> {
  const missing = new Set((body.not_found ?? []).map(identifierKey));
  const requestedFound = batch.filter((id) => !missing.has(identifierKey(id)));
  const result = new Map<string, ScryfallCard>();

  if (requestedFound.length === body.data.length) {
    requestedFound.forEach((id, i) => {
      const card = body.data[i];
      if (card) result.set(identifierKey(id), card);
    });
    return result;
  }
  for (const id of requestedFound) {
    const card = body.data.find((c) => matchesIdentifier(c, id));
    if (card) result.set(identifierKey(id), card);
  }
  return result;
}

async function parseJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new ScryfallError('Invalid JSON from Scryfall', response.status, {
      cause: error,
    });
  }
}

function backoff(attempt: number): number {
  return BASE_BACKOFF_MS * 2 ** attempt;
}

function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

function cardCacheKey(identifierKey: string): string {
  return `cards/${sha256(identifierKey)}.json`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
