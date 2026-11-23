import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CardIdentifier,
  COLLECTION_BATCH_SIZE,
  isScryfallLanguage,
  ScryfallClient,
  type ScryfallCache,
  type ScryfallCard,
  ScryfallError,
  ScryfallRateLimitError,
} from '@drawnine/scryfall-client';
import { cards, jsonResponse } from './fixtures/fixtures.js';

class MemoryCache implements ScryfallCache {
  readonly store = new Map<string, Uint8Array>();
  async get(key: string) {
    return this.store.get(key);
  }
  async set(key: string, value: Uint8Array) {
    this.store.set(key, value);
  }
}

describe('ScryfallClient', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let sleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>;
  let cache: MemoryCache;
  let clock: number;

  const client = (
    extra: Partial<ConstructorParameters<typeof ScryfallClient>[0]> = {},
  ) =>
    new ScryfallClient({
      userAgent: 'DrawNineTest/1.0',
      fetch: fetchMock,
      sleep,
      now: () => clock,
      cache,
      ...extra,
    });

  const requestedIdentifiers = (call: number): CardIdentifier[] =>
    (
      JSON.parse(fetchMock.mock.calls[call]?.[1]?.body as string) as {
        identifiers: CardIdentifier[];
      }
    ).identifiers;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });
    cache = new MemoryCache();
    clock = 0;
  });

  describe('getCollection', () => {
    it('sends custom User-Agent and Accept headers to /cards/collection', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ data: [cards.lightningBolt], not_found: [] }),
      );

      await client().getCollection([{ name: 'Lightning Bolt' }]);

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://api.scryfall.com/cards/collection');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        'User-Agent': 'DrawNineTest/1.0',
        Accept: 'application/json',
      });
    });

    it('returns found cards and not found identifiers', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          data: [cards.lightningBolt, cards.delver],
          not_found: [{ name: 'Nope' }],
        }),
      );

      const result = await client().getCollection([
        { name: 'Lightning Bolt' },
        { name: 'Nope' },
        { name: 'Delver of Secrets' },
      ]);

      expect(result.found.map((m) => [m.identifier, m.card.id])).toEqual([
        [{ name: 'Lightning Bolt' }, cards.lightningBolt.id],
        [{ name: 'Delver of Secrets' }, cards.delver.id],
      ]);
      expect(result.notFound).toEqual([{ name: 'Nope' }]);
    });

    it('falls back to matching by fields when counts disagree', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ data: [cards.delver, cards.lightningBolt] }),
      );
      const result = await client().getCollection([
        { name: 'Lightning Bolt' },
        { name: 'Delver of Secrets' },
        { name: 'Missing Card' },
      ]);
      expect(result.found.map((m) => m.card.id)).toEqual([
        cards.lightningBolt.id,
        cards.delver.id,
      ]);
      expect(result.notFound).toEqual([{ name: 'Missing Card' }]);
    });

    it('deduplicates identifiers', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ data: [cards.lightningBolt] }),
      );
      await client().getCollection([
        { name: 'Lightning Bolt' },
        { name: 'lightning bolt' },
      ]);
      expect(requestedIdentifiers(0)).toHaveLength(1);
    });

    it('splits identifiers into batches of 75', async () => {
      const ids = Array.from({ length: 160 }, (_, i) => ({
        name: `Card ${i}`,
      }));
      fetchMock.mockImplementation(async (_url, init) => {
        const { identifiers } = JSON.parse(init?.body as string) as {
          identifiers: CardIdentifier[];
        };
        return jsonResponse({ data: [], not_found: identifiers });
      });

      const result = await client().getCollection(ids);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect([0, 1, 2].map((i) => requestedIdentifiers(i).length)).toEqual([
        COLLECTION_BATCH_SIZE,
        COLLECTION_BATCH_SIZE,
        10,
      ]);
      expect(result.notFound).toHaveLength(160);
    });

    it('waits at least 100 ms between API requests', async () => {
      const ids = Array.from({ length: 151 }, (_, i) => ({
        name: `Card ${i}`,
      }));
      fetchMock.mockImplementation(async () => jsonResponse({ data: [] }));
      await client().getCollection(ids);
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([100, 100]);
    });

    it('backs off and retries on 429, honouring Retry-After', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({}, 429, { 'Retry-After': '2' }))
        .mockResolvedValueOnce(jsonResponse({}, 429))
        .mockResolvedValueOnce(jsonResponse({ data: [cards.lightningBolt] }));

      const result = await client().getCollection([{ name: 'Lightning Bolt' }]);

      expect(result.found).toHaveLength(1);
      // Retry-After: 2 s, then exponential backoff for attempt 1 (1000 × 2¹).
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2000, 2000]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('throws ScryfallRateLimitError when 429 persists', async () => {
      fetchMock.mockImplementation(async () => jsonResponse({}, 429));
      await expect(
        client({ maxRetries: 2 }).getCollection([{ name: 'Lightning Bolt' }]),
      ).rejects.toBeInstanceOf(ScryfallRateLimitError);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('retries network errors and 5xx, then throws ScryfallError', async () => {
      fetchMock
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(jsonResponse({}, 503))
        .mockResolvedValueOnce(jsonResponse({ data: [cards.lightningBolt] }));
      await expect(
        client().getCollection([{ name: 'Lightning Bolt' }]),
      ).resolves.toMatchObject({
        found: [{ card: { id: cards.lightningBolt.id } }],
      });

      fetchMock.mockReset();
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      await expect(
        client({ maxRetries: 1 }).getCollection([{ name: 'Opt' }]),
      ).rejects.toBeInstanceOf(ScryfallError);
    });

    it('does not retry 4xx errors other than 429', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ details: 'bad' }, 400));
      await expect(
        client().getCollection([{ name: 'X' }]),
      ).rejects.toMatchObject({
        status: 400,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('serves cached metadata without calling the API', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ data: [cards.lightningBolt] }),
      );
      await client().getCollection([{ name: 'Lightning Bolt' }]);
      const result = await client().getCollection([{ name: 'Lightning Bolt' }]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.found[0]?.card.id).toBe(cards.lightningBolt.id);
    });

    it('refetches metadata older than the TTL', async () => {
      fetchMock.mockImplementation(async () =>
        jsonResponse({ data: [cards.lightningBolt] }),
      );
      await client({ metadataTtlMs: 1000 }).getCollection([
        { name: 'Lightning Bolt' },
      ]);
      clock += 5000;
      await client({ metadataTtlMs: 1000 }).getCollection([
        { name: 'Lightning Bolt' },
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('getLocalizedPrint', () => {
    const bolt: ScryfallCard = {
      ...cards.lightningBolt,
      lang: 'en',
      oracle_id: '4457ed35-7c10-48c8-9776-456485fdf070',
    };
    const boltEs: ScryfallCard = {
      ...bolt,
      id: 'bolt-es',
      lang: 'es',
      image_uris: { png: 'https://cards.scryfall.io/png/es/bolt.png' },
    };
    const boltEsOther: ScryfallCard = {
      ...boltEs,
      id: 'bolt-es-2xm',
      set: '2xm',
      collector_number: '117',
    };
    const notFound = () =>
      jsonResponse({ object: 'error', code: 'not_found' }, 404);
    const urlOf = (call: number) =>
      new URL(fetchMock.mock.calls[call]?.[0] as string);

    it('returns the same printing in the requested language', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(boltEs));

      const result = await client().getLocalizedPrint(bolt, 'es');

      expect(result?.id).toBe('bolt-es');
      expect(fetchMock.mock.calls[0]?.[0] as string).toBe(
        'https://api.scryfall.com/cards/m10/146/es',
      );
      expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
        'User-Agent': 'DrawNineTest/1.0',
        Accept: 'application/json',
      });
    });

    it('searches other printings when the same one is not in that language', async () => {
      fetchMock
        .mockResolvedValueOnce(notFound())
        .mockResolvedValueOnce(jsonResponse({ data: [boltEsOther] }));

      const result = await client().getLocalizedPrint(bolt, 'es');

      expect(result?.id).toBe('bolt-es-2xm');
      const search = urlOf(1);
      expect(search.pathname).toBe('/cards/search');
      expect(search.searchParams.get('q')).toBe(
        `oracleid:${bolt.oracle_id} lang:es`,
      );
      expect(search.searchParams.get('unique')).toBe('prints');
    });

    it('searches by exact name when there is no oracle id', async () => {
      fetchMock
        .mockResolvedValueOnce(notFound())
        .mockResolvedValueOnce(notFound());
      const { oracle_id: _omit, ...noOracle } = bolt;

      await client().getLocalizedPrint(noOracle, 'fr');

      expect(urlOf(1).searchParams.get('q')).toBe('!"Lightning Bolt" lang:fr');
    });

    it('skips localized printings without a real image', async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({ ...boltEs, image_status: 'placeholder' }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            data: [{ ...boltEsOther, image_status: 'missing' }, boltEsOther],
          }),
        );
      const result = await client().getLocalizedPrint(bolt, 'es');
      expect(result?.id).toBe('bolt-es-2xm');
      expect(result?.image_status).toBe(undefined);
    });

    it('returns undefined when no printing exists in that language', async () => {
      fetchMock
        .mockResolvedValueOnce(notFound())
        .mockResolvedValueOnce(notFound());
      await expect(client().getLocalizedPrint(bolt, 'ja')).resolves.toBe(
        undefined,
      );
    });

    it('does not search other printings when samePrintingOnly', async () => {
      fetchMock.mockResolvedValueOnce(notFound());
      await expect(
        client().getLocalizedPrint(bolt, 'es', { samePrintingOnly: true }),
      ).resolves.toBe(undefined);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('caches hits and misses', async () => {
      fetchMock
        .mockResolvedValueOnce(notFound())
        .mockResolvedValueOnce(notFound())
        .mockResolvedValueOnce(jsonResponse(boltEs));

      await client().getLocalizedPrint(bolt, 'ja');
      await client().getLocalizedPrint(bolt, 'ja');
      await client().getLocalizedPrint(bolt, 'es');
      await client().getLocalizedPrint(bolt, 'es');

      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('needs no request when the card is already in that language', async () => {
      await expect(client().getLocalizedPrint(boltEs, 'es')).resolves.toBe(
        boltEs,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('propagates errors other than 404', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 400));
      await expect(
        client().getLocalizedPrint(bolt, 'es'),
      ).rejects.toBeInstanceOf(ScryfallError);
    });

    it('recognises Scryfall language codes', () => {
      expect(isScryfallLanguage('es')).toBe(true);
      expect(isScryfallLanguage('zhs')).toBe(true);
      expect(isScryfallLanguage('spanish')).toBe(false);
    });
  });

  describe('getImage', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

    it('never fetches the same image twice in one run', async () => {
      fetchMock.mockImplementation(async () => new Response(png));
      const c = client({ cache: undefined });
      const url = cards.lightningBolt.image_uris!.png!;

      const [a, b] = await Promise.all([c.getImage(url), c.getImage(url)]);
      await c.getImage(url);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(a).toEqual(png);
      expect(b).toEqual(png);
      expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
        'User-Agent': 'DrawNineTest/1.0',
      });
    });

    it('reuses images from the persistent cache', async () => {
      fetchMock.mockImplementation(async () => new Response(png));
      const url = cards.delver.card_faces![0]!.image_uris!.png!;
      await client().getImage(url);
      await client().getImage(url);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('can retry an image after a failure', async () => {
      fetchMock
        .mockResolvedValueOnce(new Response('nope', { status: 404 }))
        .mockResolvedValueOnce(new Response(png));
      const c = client();
      await expect(
        c.getImage('https://cards.scryfall.io/x.png'),
      ).rejects.toBeInstanceOf(ScryfallError);
      await expect(
        c.getImage('https://cards.scryfall.io/x.png'),
      ).resolves.toEqual(png);
    });
  });
});
