import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ArtArchiveError,
  ArtArchiveLimitError,
  ArtArchiveReader,
  DEFAULT_ZIP_LIMITS,
} from '@app/assets';
import { targetSize } from '../src/art-archive-reader.js';
import { makeJpg, makePng, makeZip } from './helpers.js';

describe('ArtArchiveReader', () => {
  let hiRes: Uint8Array;
  let lowRes: Uint8Array;

  beforeAll(async () => {
    hiRes = await makePng(800, 1100);
    lowRes = await makePng(300, 420);
  });

  it('merges custom limits with the defaults', () => {
    const reader = new ArtArchiveReader({ limits: { maxEntries: 10 } });
    expect(reader.limits).toEqual({ ...DEFAULT_ZIP_LIMITS, maxEntries: 10 });
    expect(reader.fit).toBe('cover');
  });

  it('reads images keyed by normalized card name', async () => {
    const zip = makeZip({
      'Lightning Bolt.png': hiRes,
      'split/Fire_Ice.PNG': hiRes,
    });
    const { assets, warnings } = await new ArtArchiveReader().read(zip);

    expect([...assets.keys()]).toEqual(['lightning bolt', 'fire // ice']);
    expect(assets.get('fire // ice')).toMatchObject({
      fileName: 'Fire_Ice.PNG',
      format: 'png',
    });
    expect(warnings).toEqual([]);
  });

  it('normalizes to a 63:88 aspect ratio (cover crops)', async () => {
    const square = await makePng(1000, 1000);
    const { assets } = await new ArtArchiveReader().read(
      makeZip({ 'Opt.png': square }),
    );
    const asset = assets.get('opt')!;
    const meta = await sharp(asset.bytes).metadata();
    expect(meta.height).toBe(1000);
    expect(meta.width).toBe(Math.round(1000 * (63 / 88)));
    expect(asset).toMatchObject({ width: meta.width, height: meta.height });
  });

  it('pads instead of cropping with fit=contain', async () => {
    const square = await makePng(1000, 1000);
    const { assets } = await new ArtArchiveReader({ fit: 'contain' }).read(
      makeZip({ 'Opt.png': square }),
    );
    const meta = await sharp(assets.get('opt')!.bytes).metadata();
    expect(meta.width).toBe(1000);
    expect(meta.height).toBe(Math.round(1000 / (63 / 88)));
  });

  it('keeps JPG as JPG', async () => {
    const { assets } = await new ArtArchiveReader().read(
      makeZip({ 'Island.jpg': await makeJpg(745, 1040) }),
    );
    const asset = assets.get('island')!;
    expect(asset.format).toBe('jpg');
    expect((await sharp(asset.bytes).metadata()).format).toBe('jpeg');
  });

  it('warns when resolution is below 744×1039', async () => {
    const { assets, warnings } = await new ArtArchiveReader().read(
      makeZip({ 'Opt.png': lowRes }),
    );
    expect(assets.has('opt')).toBe(true);
    expect(warnings).toEqual([
      expect.objectContaining({ fileName: 'Opt.png', code: 'low-resolution' }),
    ]);
  });

  it('ignores files that sharp cannot open, whatever their extension', async () => {
    const { assets, warnings } = await new ArtArchiveReader().read(
      makeZip({
        'Fake.png': new TextEncoder().encode('not an image'),
        'Opt.png': hiRes,
      }),
    );
    expect([...assets.keys()]).toEqual(['opt']);
    expect(warnings).toEqual([
      expect.objectContaining({ fileName: 'Fake.png', code: 'not-an-image' }),
    ]);
  });

  it('accepts real images regardless of extension', async () => {
    const { assets } = await new ArtArchiveReader().read(
      makeZip({ 'Opt.dat': hiRes }),
    );
    expect(assets.get('opt')?.format).toBe('png');
  });

  describe('zip slip', () => {
    it('ignores entries with `..`, absolute paths and symlinks', async () => {
      const zip = makeZip({
        '../Evil.png': hiRes,
        'art/../../Evil2.png': hiRes,
        '/etc/Evil3.png': hiRes,
        'C:/Evil4.png': hiRes,
        'Link.png': [hiRes, { os: 3, attrs: (0o120777 << 16) >>> 0 }],
        'Good.png': hiRes,
      });
      const { assets, warnings } = await new ArtArchiveReader().read(zip);

      expect([...assets.keys()]).toEqual(['good']);
      expect(warnings.map((w) => [w.fileName, w.code])).toEqual([
        ['../Evil.png', 'unsafe-path'],
        ['art/../../Evil2.png', 'unsafe-path'],
        ['/etc/Evil3.png', 'unsafe-path'],
        ['C:/Evil4.png', 'unsafe-path'],
        ['Link.png', 'symlink'],
      ]);
    });
  });

  it('skips directories and OS junk files silently', async () => {
    const zip = makeZip({
      'art/': new Uint8Array(),
      '__MACOSX/._Opt.png': new Uint8Array([1]),
      '.DS_Store': new Uint8Array([1]),
      'art/Opt.png': hiRes,
    });
    const { assets, warnings } = await new ArtArchiveReader().read(zip);
    expect([...assets.keys()]).toEqual(['opt']);
    expect(warnings).toEqual([]);
  });

  it('warns about duplicated card names and keeps the last one', async () => {
    const { assets, warnings } = await new ArtArchiveReader().read(
      makeZip({ 'a/Opt.png': hiRes, 'b/opt.png': hiRes }),
    );
    expect(assets.get('opt')?.fileName).toBe('opt.png');
    expect(warnings.map((w) => w.code)).toEqual(['duplicate-name']);
  });

  describe('limits', () => {
    it('rejects zips above the compressed size limit', async () => {
      const zip = makeZip({ 'Opt.png': hiRes });
      await expect(
        new ArtArchiveReader({
          limits: { maxCompressedBytes: zip.byteLength - 1 },
        }).read(zip),
      ).rejects.toBeInstanceOf(ArtArchiveLimitError);
    });

    it('accepts zips of any size when the compressed limit is null', async () => {
      const zip = makeZip({ 'Opt.png': hiRes });
      const { assets } = await new ArtArchiveReader({
        limits: { maxCompressedBytes: null },
      }).read(zip);
      expect(assets.has('opt')).toBe(true);
    });

    it('rejects zips above the uncompressed size limit', async () => {
      const zip = makeZip({
        'Big.png': [new Uint8Array(2_000_000), { level: 9 }],
      });
      await expect(
        new ArtArchiveReader({
          limits: { maxUncompressedBytes: 1_000_000 },
        }).read(zip),
      ).rejects.toBeInstanceOf(ArtArchiveLimitError);
    });

    it('rejects zips with too many entries', async () => {
      const files = Object.fromEntries(
        Array.from({ length: 4 }, (_, i) => [`${i}.png`, new Uint8Array([i])]),
      );
      await expect(
        new ArtArchiveReader({ limits: { maxEntries: 3 } }).read(
          makeZip(files),
        ),
      ).rejects.toBeInstanceOf(ArtArchiveLimitError);
    });

    it('rejects images above the pixel limit', async () => {
      const { assets, warnings } = await new ArtArchiveReader({
        maxInputPixels: 1000,
      }).read(makeZip({ 'Opt.png': hiRes }));
      expect(assets.size).toBe(0);
      expect(warnings[0]?.code).toBe('not-an-image');
    });
  });

  it('throws ArtArchiveError for data that is not a zip', async () => {
    await expect(
      new ArtArchiveReader().read(new TextEncoder().encode('nope')),
    ).rejects.toBeInstanceOf(ArtArchiveError);
  });
});

describe('targetSize', () => {
  it('crops to the largest 63:88 box with cover', () => {
    expect(targetSize(745, 1040, 'cover')).toEqual({
      width: 745,
      height: 1040,
    });
    expect(targetSize(2000, 1000, 'cover')).toEqual({
      width: 716,
      height: 1000,
    });
  });

  it('pads to the smallest 63:88 box with contain', () => {
    expect(targetSize(2000, 1000, 'contain')).toEqual({
      width: 2000,
      height: 2794,
    });
  });
});
