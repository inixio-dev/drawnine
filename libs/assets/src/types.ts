export interface ZipLimits {
  /** Max size of the .zip itself; `null` disables the check. */
  maxCompressedBytes: number | null;
  maxUncompressedBytes: number;
  maxEntries: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxCompressedBytes: 50 * 1024 * 1024,
  maxUncompressedBytes: 200 * 1024 * 1024,
  maxEntries: 500,
};

/** Minimum recommended resolution; lower values produce a warning. */
export const MIN_RECOMMENDED_WIDTH_PX = 744;
export const MIN_RECOMMENDED_HEIGHT_PX = 1039;
/** Card aspect ratio (width / height). */
export const CARD_ASPECT_RATIO = 63 / 88;

export type FitMode = 'cover' | 'contain';

export interface ArtAsset {
  /** Normalized card name used for matching (see normalizeCardName). */
  key: string;
  fileName: string;
  bytes: Uint8Array;
  format: 'png' | 'jpg';
  width: number;
  height: number;
}

export type ArtWarningCode =
  | 'unsafe-path'
  | 'symlink'
  | 'encrypted'
  | 'corrupt-entry'
  | 'not-an-image'
  | 'low-resolution'
  | 'duplicate-name';

export interface ArtWarning {
  fileName: string;
  /** Stable code, suitable as an i18n key. */
  code: ArtWarningCode;
  /** Human-readable message (Spanish). */
  message: string;
}

export interface ArtArchive {
  /** Keyed by normalized card name. */
  assets: Map<string, ArtAsset>;
  warnings: ArtWarning[];
}
