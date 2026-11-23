import { inflateSync } from 'fflate';

/**
 * Minimal in-memory ZIP central directory reader. fflate does the inflating;
 * this exists to expose what fflate hides (Unix mode for symlink detection,
 * encryption flags) and to enforce size limits before decompressing.
 */
export interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  method: number;
  isDirectory: boolean;
  isSymlink: boolean;
  isEncrypted: boolean;
  localHeaderOffset: number;
}

export class ZipFormatError extends Error {
  override readonly name = 'ZipFormatError';
}

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const EOCD_MIN = 22;
const MAX_COMMENT = 0xffff;
const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;
const HOST_UNIX = 3;

export const METHOD_STORED = 0;
export const METHOD_DEFLATE = 8;

export function listZipEntries(zip: Uint8Array): ZipEntry[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  try {
    const eocd = findEocd(view);
    const total = view.getUint16(eocd + 10, true);
    const cdOffset = view.getUint32(eocd + 16, true);
    if (total === 0xffff || cdOffset === 0xffffffff) {
      throw new ZipFormatError('ZIP64 archives are not supported');
    }

    const decoder = new TextDecoder();
    const entries: ZipEntry[] = [];
    let p = cdOffset;
    for (let i = 0; i < total; i++) {
      if (view.getUint32(p, true) !== CENTRAL_SIG) {
        throw new ZipFormatError('Corrupt central directory');
      }
      const madeBy = view.getUint16(p + 4, true);
      const flags = view.getUint16(p + 8, true);
      const method = view.getUint16(p + 10, true);
      const crc32 = view.getUint32(p + 16, true);
      const compressedSize = view.getUint32(p + 20, true);
      const uncompressedSize = view.getUint32(p + 24, true);
      const nameLength = view.getUint16(p + 28, true);
      const extraLength = view.getUint16(p + 30, true);
      const commentLength = view.getUint16(p + 32, true);
      const externalAttrs = view.getUint32(p + 38, true);
      const localHeaderOffset = view.getUint32(p + 42, true);
      const nameStart = p + 46;
      if (nameStart + nameLength > zip.byteLength) {
        throw new ZipFormatError('Corrupt central directory');
      }
      const name = decoder.decode(
        zip.subarray(nameStart, nameStart + nameLength),
      );
      const unixMode = externalAttrs >>> 16;

      entries.push({
        name,
        compressedSize,
        uncompressedSize,
        crc32,
        method,
        isDirectory: name.endsWith('/'),
        isSymlink: madeBy >> 8 === HOST_UNIX && (unixMode & S_IFMT) === S_IFLNK,
        isEncrypted: (flags & 1) === 1,
        localHeaderOffset,
      });
      p = nameStart + nameLength + extraLength + commentLength;
    }
    return entries;
  } catch (error) {
    if (error instanceof ZipFormatError) throw error;
    throw new ZipFormatError('Corrupt zip file', { cause: error });
  }
}

/**
 * Decompresses one entry. The output buffer is allocated from the declared
 * size and never grows, so a lying header cannot inflate past the limit.
 */
export function extractZipEntry(zip: Uint8Array, entry: ZipEntry): Uint8Array {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  try {
    const p = entry.localHeaderOffset;
    if (view.getUint32(p, true) !== LOCAL_SIG) {
      throw new ZipFormatError(`Corrupt local header for ${entry.name}`);
    }
    const start =
      p + 30 + view.getUint16(p + 26, true) + view.getUint16(p + 28, true);
    const end = start + entry.compressedSize;
    if (end > zip.byteLength) {
      throw new ZipFormatError(`Truncated data for ${entry.name}`);
    }
    const data = zip.subarray(start, end);

    let out: Uint8Array;
    if (entry.method === METHOD_STORED) {
      out = data.slice();
    } else if (entry.method === METHOD_DEFLATE) {
      out = inflateSync(data, { out: new Uint8Array(entry.uncompressedSize) });
    } else {
      throw new ZipFormatError(
        `Unsupported compression method ${entry.method}`,
      );
    }
    // Catches truncated output from a lying size header and corrupted data.
    if (
      out.byteLength !== entry.uncompressedSize ||
      crc32(out) !== entry.crc32
    ) {
      throw new ZipFormatError(`Checksum mismatch for ${entry.name}`);
    }
    return out;
  } catch (error) {
    if (error instanceof ZipFormatError) throw error;
    throw new ZipFormatError(`Corrupt data for ${entry.name}`, {
      cause: error,
    });
  }
}

function findEocd(view: DataView): number {
  const min = Math.max(0, view.byteLength - EOCD_MIN - MAX_COMMENT);
  for (let p = view.byteLength - EOCD_MIN; p >= min; p--) {
    if (view.getUint32(p, true) === EOCD_SIG) return p;
  }
  throw new ZipFormatError('Not a zip file');
}

/** `..` segments, absolute paths, drive letters and NUL bytes are unsafe. */
export function isUnsafeZipPath(name: string): boolean {
  if (name.includes('\0')) return true;
  const path = name.replace(/\\/g, '/');
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return true;
  return path.split('/').includes('..');
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
