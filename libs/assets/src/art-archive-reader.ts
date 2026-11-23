import sharp from 'sharp';
import { ArtArchiveError, ArtArchiveLimitError } from './errors.js';
import { ART_WARNING_MESSAGES } from './messages.js';
import { normalizeCardName } from './normalize-card-name.js';
import {
  type ArtArchive,
  type ArtAsset,
  type ArtWarning,
  type ArtWarningCode,
  CARD_ASPECT_RATIO,
  DEFAULT_ZIP_LIMITS,
  type FitMode,
  MIN_RECOMMENDED_HEIGHT_PX,
  MIN_RECOMMENDED_WIDTH_PX,
  type ZipLimits,
} from './types.js';
import {
  extractZipEntry,
  isUnsafeZipPath,
  listZipEntries,
  type ZipEntry,
  ZipFormatError,
} from './zip/read-zip.js';

export interface ArtArchiveReaderOptions {
  limits?: Partial<ZipLimits>;
  fit?: FitMode;
  /** Max pixels per input image (decompression-bomb guard for sharp). */
  maxInputPixels?: number;
}

const DEFAULT_MAX_INPUT_PIXELS = 50_000_000;
const JPEG_QUALITY = 92;

/**
 * Reads an art .zip in memory (never extracts to disk), rejects unsafe entries
 * (`..`, absolute paths, symlinks), validates images with sharp and normalizes
 * them to 63:88.
 */
export class ArtArchiveReader {
  readonly limits: ZipLimits;
  readonly fit: FitMode;
  private readonly maxInputPixels: number;

  constructor(options: ArtArchiveReaderOptions = {}) {
    this.limits = { ...DEFAULT_ZIP_LIMITS, ...options.limits };
    this.fit = options.fit ?? 'cover';
    this.maxInputPixels = options.maxInputPixels ?? DEFAULT_MAX_INPUT_PIXELS;
  }

  async read(zip: Uint8Array): Promise<ArtArchive> {
    const { maxCompressedBytes } = this.limits;
    if (maxCompressedBytes !== null && zip.byteLength > maxCompressedBytes) {
      throw new ArtArchiveLimitError(
        `El .zip supera el tamaño máximo (${maxCompressedBytes} bytes).`,
      );
    }

    let entries: ZipEntry[];
    try {
      entries = listZipEntries(zip);
    } catch (error) {
      throw new ArtArchiveError('El archivo no es un .zip válido.', {
        cause: error,
      });
    }

    if (entries.length > this.limits.maxEntries) {
      throw new ArtArchiveLimitError(
        `El .zip tiene demasiados archivos (máximo ${this.limits.maxEntries}).`,
      );
    }

    const warnings: ArtWarning[] = [];
    const warn = (fileName: string, code: ArtWarningCode): void => {
      warnings.push({ fileName, code, message: ART_WARNING_MESSAGES[code] });
    };

    const candidates = entries.filter((entry) => {
      if (entry.isDirectory || isJunk(entry.name)) return false;
      if (isUnsafeZipPath(entry.name))
        return (warn(entry.name, 'unsafe-path'), false);
      if (entry.isSymlink) return (warn(entry.name, 'symlink'), false);
      if (entry.isEncrypted) return (warn(entry.name, 'encrypted'), false);
      return true;
    });

    const declared = candidates.reduce((sum, e) => sum + e.uncompressedSize, 0);
    if (declared > this.limits.maxUncompressedBytes) {
      throw new ArtArchiveLimitError(
        `El contenido del .zip descomprimido supera el máximo (${this.limits.maxUncompressedBytes} bytes).`,
      );
    }

    const assets = new Map<string, ArtAsset>();
    for (const entry of candidates) {
      const fileName = baseName(entry.name);

      let bytes: Uint8Array;
      try {
        bytes = extractZipEntry(zip, entry);
      } catch (error) {
        if (error instanceof ZipFormatError) {
          warn(entry.name, 'corrupt-entry');
          continue;
        }
        throw error;
      }

      const asset = await this.normalizeImage(fileName, bytes);
      if (!asset) {
        warn(entry.name, 'not-an-image');
        continue;
      }
      if (
        asset.width < MIN_RECOMMENDED_WIDTH_PX ||
        asset.height < MIN_RECOMMENDED_HEIGHT_PX
      ) {
        warn(entry.name, 'low-resolution');
      }
      if (assets.has(asset.key)) warn(entry.name, 'duplicate-name');
      assets.set(asset.key, asset);
    }

    return { assets, warnings };
  }

  /** Opens the bytes with sharp (rejecting non-images) and crops/pads to 63:88. */
  private async normalizeImage(
    fileName: string,
    bytes: Uint8Array,
  ): Promise<ArtAsset | undefined> {
    const input = {
      limitInputPixels: this.maxInputPixels,
      failOn: 'error' as const,
    };
    try {
      const meta = await sharp(bytes, input).metadata();
      if (!meta.width || !meta.height) return undefined;

      // EXIF orientations 5–8 swap width and height once auto-rotated.
      const rotated = (meta.orientation ?? 1) >= 5;
      const srcWidth = rotated ? meta.height : meta.width;
      const srcHeight = rotated ? meta.width : meta.height;
      const { width, height } = targetSize(srcWidth, srcHeight, this.fit);

      const pipeline = sharp(bytes, input)
        .rotate()
        .resize(width, height, {
          fit: this.fit,
          position: 'centre',
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        });
      const format = meta.format === 'jpeg' ? 'jpg' : 'png';
      const output =
        format === 'jpg'
          ? await pipeline.jpeg({ quality: JPEG_QUALITY }).toBuffer()
          : await pipeline.png().toBuffer();

      return {
        key: normalizeCardName(fileName),
        fileName,
        bytes: new Uint8Array(output),
        format,
        width,
        height,
      };
    } catch {
      return undefined;
    }
  }
}

/** Largest 63:88 box inside (cover) or smallest around (contain) the source. */
export function targetSize(
  width: number,
  height: number,
  fit: FitMode,
): { width: number; height: number } {
  const widthFromHeight = Math.round(height * CARD_ASPECT_RATIO);
  const w =
    fit === 'cover'
      ? Math.min(width, widthFromHeight)
      : Math.max(width, widthFromHeight);
  const h = Math.round(w / CARD_ASPECT_RATIO);
  // With cover, never exceed the source height because of rounding.
  return {
    width: Math.max(1, w),
    height: Math.max(1, fit === 'cover' ? Math.min(h, height) : h),
  };
}

function baseName(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() ?? path;
}

/** macOS/OS metadata files that are not art and need no warning. */
function isJunk(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  const name = baseName(normalized);
  return (
    normalized.startsWith('__MACOSX/') ||
    name.startsWith('.') ||
    name.toLowerCase() === 'thumbs.db'
  );
}
