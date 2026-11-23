import { describe, expect, it } from 'vitest';
import {
  detectImageFormat,
  getCardImages,
  identifierKey,
  matchesIdentifier,
} from '@app/scryfall-client';
import { cards } from './fixtures/fixtures.js';

describe('getCardImages', () => {
  it('returns one png for a normal card', () => {
    expect(getCardImages(cards.lightningBolt, { bothFaces: true })).toEqual([
      { faceName: 'Lightning Bolt', url: cards.lightningBolt.image_uris!.png },
    ]);
  });

  it('returns both faces of a double-faced card', () => {
    expect(
      getCardImages(cards.delver, { bothFaces: true }).map((f) => f.faceName),
    ).toEqual(['Delver of Secrets', 'Insectile Aberration']);
  });

  it('returns only the front face when bothFaces is false', () => {
    expect(getCardImages(cards.delver, { bothFaces: false })).toHaveLength(1);
  });

  it('returns a single image for split cards (`//` names)', () => {
    expect(getCardImages(cards.fireIce, { bothFaces: true })).toEqual([
      { faceName: 'Fire // Ice', url: cards.fireIce.image_uris!.png },
    ]);
  });

  it('honours the requested version and falls back to png', () => {
    expect(
      getCardImages(cards.lightningBolt, {
        bothFaces: true,
        version: 'large',
      })[0]?.url,
    ).toBe(cards.lightningBolt.image_uris!.large);
    expect(
      getCardImages(cards.fireIce, { bothFaces: true, version: 'large' })[0]
        ?.url,
    ).toBe(cards.fireIce.image_uris!.png);
  });
});

describe('matchesIdentifier', () => {
  it('matches names case- and accent-insensitively', () => {
    expect(
      matchesIdentifier(cards.lilianaEnTilde, { name: "lim-dul's vault" }),
    ).toBe(true);
  });

  it('matches a double-faced card by its front face name', () => {
    expect(matchesIdentifier(cards.delver, { name: 'Delver of Secrets' })).toBe(
      true,
    );
  });

  it('matches set + collector number', () => {
    expect(
      matchesIdentifier(cards.lightningBolt, {
        set: 'M10',
        collector_number: '146',
      }),
    ).toBe(true);
    expect(
      matchesIdentifier(cards.lightningBolt, {
        set: 'M11',
        collector_number: '146',
      }),
    ).toBe(false);
  });

  it('checks the set for name + set identifiers', () => {
    expect(
      matchesIdentifier(cards.lightningBolt, {
        name: 'Lightning Bolt',
        set: 'lea',
      }),
    ).toBe(false);
  });
});

describe('identifierKey', () => {
  it('is stable across case and accents', () => {
    expect(identifierKey({ name: 'Lim-Dûl’s Vault'.replace('’', "'") })).toBe(
      identifierKey({ name: "LIM-DUL'S VAULT" }),
    );
  });
});

describe('detectImageFormat', () => {
  it('detects png and jpg by magic bytes', () => {
    expect(detectImageFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(
      'png',
    );
    expect(detectImageFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      'jpg',
    );
    expect(detectImageFormat(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });
});
