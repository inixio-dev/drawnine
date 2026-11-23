import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { zipSync } from 'fflate';
import sharp from 'sharp';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type CardIdentifier,
  ScryfallClient,
  type ScryfallCard,
} from '@app/scryfall-client';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

const bolt: ScryfallCard = {
  id: 'bolt',
  name: 'Lightning Bolt',
  set: 'm10',
  collector_number: '146',
  layout: 'normal',
  image_uris: { png: 'https://img.test/bolt.png' },
};

/** Tests never call the real Scryfall API. */
const fakeScryfall = {
  getCollection: vi.fn(async (ids: readonly CardIdentifier[]) => ({
    found: ids
      .filter((id) => 'name' in id && id.name === bolt.name)
      .map((identifier) => ({ identifier, card: bolt })),
    notFound: ids.filter((id) => !('name' in id) || id.name !== bolt.name),
  })),
  getImage: vi.fn<(url: string) => Promise<Uint8Array>>(),
  getLocalizedPrint: vi.fn(async () => undefined),
};

describe('API (e2e)', () => {
  let app: INestApplication<App>;
  let root: string;
  let png: Uint8Array;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'drawnine-e2e-'));
    process.env.STORAGE_DISK_ROOT = root;
    png = new Uint8Array(
      await sharp({
        create: { width: 745, height: 1040, channels: 3, background: '#a00' },
      })
        .png()
        .toBuffer(),
    );
    fakeScryfall.getImage.mockResolvedValue(png);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ScryfallClient)
      .useValue(fakeScryfall)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });

  describe('POST /decks/parse', () => {
    it('returns the parsed decklist and errors', async () => {
      const res = await request(app.getHttpServer())
        .post('/decks/parse')
        .send({ decklist: '4 Lightning Bolt (M10) 146\nnonsense' })
        .expect(200);
      expect(res.body.entries).toEqual([
        {
          line: 1,
          quantity: 4,
          name: 'Lightning Bolt',
          section: 'main',
          setCode: 'M10',
          collectorNumber: '146',
        },
      ]);
      expect(res.body.errors).toEqual([
        expect.objectContaining({ line: 2, code: 'missing-quantity' }),
      ]);
    });

    it('rejects a missing decklist', () => {
      return request(app.getHttpServer())
        .post('/decks/parse')
        .send({})
        .expect(400);
    });
  });

  describe('POST /proxies', () => {
    const binary = (
      res: request.Response,
      cb: (err: Error | null, body: Buffer) => void,
    ) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    };

    it('streams a PDF', async () => {
      const res = await request(app.getHttpServer())
        .post('/proxies')
        .field('decklist', '10 Lightning Bolt')
        .field('gap', '2')
        .field('cutMarks', 'false')
        .buffer(true)
        .parse(binary)
        .expect(201);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['x-drawnine-pages']).toBe('2');
      expect(res.headers['x-drawnine-cards']).toBe('10');
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('accepts an art zip and reports warnings', async () => {
      const zip = zipSync({ 'Lightning Bolt.png': png, '../evil.png': png });
      const res = await request(app.getHttpServer())
        .post('/proxies')
        .field('decklist', '1 Lightning Bolt')
        .attach('art', Buffer.from(zip), 'art.zip')
        .buffer(true)
        .parse(binary)
        .expect(201);
      const warnings = JSON.parse(
        decodeURIComponent(String(res.headers['x-drawnine-warnings'])),
      );
      expect(warnings).toEqual([
        expect.objectContaining({ code: 'unsafe-path' }),
      ]);
    });

    it('returns 422 with the invalid lines', async () => {
      const res = await request(app.getHttpServer())
        .post('/proxies')
        .field('decklist', 'Lightning Bolt')
        .expect(422);
      expect(res.body.errors).toHaveLength(1);
    });

    it('returns 422 with the cards not found', async () => {
      const res = await request(app.getHttpServer())
        .post('/proxies')
        .field('decklist', '1 Not A Card')
        .expect(422);
      expect(res.body.cards).toEqual(['Not A Card']);
    });

    it('accepts lang and warns about cards only available in English', async () => {
      const res = await request(app.getHttpServer())
        .post('/proxies')
        .field('decklist', '1 Lightning Bolt')
        .field('lang', 'ES')
        .buffer(true)
        .parse(binary)
        .expect(201);
      expect(fakeScryfall.getLocalizedPrint).toHaveBeenCalledWith(bolt, 'es', {
        samePrintingOnly: false,
      });
      const warnings = JSON.parse(
        decodeURIComponent(String(res.headers['x-drawnine-warnings'])),
      );
      expect(warnings).toEqual([
        expect.objectContaining({
          code: 'language-unavailable',
          card: 'Lightning Bolt',
        }),
      ]);
    });

    it('rejects an unknown lang', () => {
      return request(app.getHttpServer())
        .post('/proxies')
        .field('decklist', '4 Lightning Bolt')
        .field('lang', 'spanish')
        .expect(400);
    });

    it('rejects an out-of-range gap', () => {
      return request(app.getHttpServer())
        .post('/proxies')
        .field('decklist', '4 Lightning Bolt')
        .field('gap', '20')
        .expect(400);
    });

    it('rejects gap + bleed that do not fit on A4', () => {
      return request(app.getHttpServer())
        .post('/proxies')
        .field('decklist', '4 Lightning Bolt')
        .field('gap', '10')
        .field('bleed', '3')
        .expect(400);
    });

    it('rejects an invalid zip', () => {
      return request(app.getHttpServer())
        .post('/proxies')
        .field('decklist', '1 Lightning Bolt')
        .attach('art', Buffer.from('not a zip'), 'art.zip')
        .expect(400);
    });
  });
});
