import { describe, expect, it } from 'vitest';
import {
  extractZipEntry,
  isUnsafeZipPath,
  listZipEntries,
  ZipFormatError,
} from '../../src/zip/read-zip.js';
import { lieAboutUncompressedSize, makeZip } from '../helpers.js';

const text = (s: string) => new TextEncoder().encode(s);

describe('listZipEntries / extractZipEntry', () => {
  it('lists and extracts stored and deflated entries', () => {
    const zip = makeZip({
      'a.txt': [text('hello'), { level: 0 }],
      'dir/b.txt': [text('world '.repeat(100)), { level: 9 }],
    });
    const entries = listZipEntries(zip);
    expect(entries.map((e) => [e.name, e.method])).toEqual([
      ['a.txt', 0],
      ['dir/b.txt', 8],
    ]);
    expect(new TextDecoder().decode(extractZipEntry(zip, entries[0]!))).toBe(
      'hello',
    );
    expect(extractZipEntry(zip, entries[1]!).byteLength).toBe(600);
  });

  it('rejects entries whose data does not match the CRC', () => {
    const zip = makeZip({ 'a.txt': [text('hello'), { level: 0 }] });
    const [entry] = listZipEntries(zip);
    const corrupted = zip.slice();
    corrupted[30 + 'a.txt'.length] = 0x58; // first data byte
    expect(() => extractZipEntry(corrupted, entry!)).toThrow(ZipFormatError);
  });

  it('detects unix symlinks', () => {
    const zip = makeZip({
      'link.png': [
        text('/etc/passwd'),
        { os: 3, attrs: (0o120777 << 16) >>> 0 },
      ],
      'file.png': [text('x'), { os: 3, attrs: (0o100644 << 16) >>> 0 }],
    });
    expect(listZipEntries(zip).map((e) => e.isSymlink)).toEqual([true, false]);
  });

  it('does not inflate past the declared size (lying header)', () => {
    const zip = lieAboutUncompressedSize(
      makeZip({ 'bomb.png': [new Uint8Array(5_000_000), { level: 9 }] }),
      100,
    );
    const [entry] = listZipEntries(zip);
    expect(entry?.uncompressedSize).toBe(100);
    expect(() => extractZipEntry(zip, entry!)).toThrow(ZipFormatError);
  });

  it('rejects data that is not a zip', () => {
    expect(() =>
      listZipEntries(text('definitely not a zip file at all')),
    ).toThrow(ZipFormatError);
    expect(() => listZipEntries(new Uint8Array())).toThrow(ZipFormatError);
  });

  it('rejects a truncated zip', () => {
    const zip = makeZip({ 'a.txt': text('hello world') });
    expect(() => listZipEntries(zip.subarray(10))).toThrow(ZipFormatError);
  });
});

describe('isUnsafeZipPath', () => {
  it.each([
    '../evil.png',
    'art/../../evil.png',
    '..\\evil.png',
    '/etc/evil.png',
    '\\evil.png',
    'C:/evil.png',
    'c:evil.png',
    'a\0.png',
  ])('flags %s', (path) => {
    expect(isUnsafeZipPath(path)).toBe(true);
  });

  it.each([
    'Lightning Bolt.png',
    'art/Fire_Ice.png',
    'a..b.png',
    'dir/..hidden.png',
  ])('allows %s', (path) => {
    expect(isUnsafeZipPath(path)).toBe(false);
  });
});
