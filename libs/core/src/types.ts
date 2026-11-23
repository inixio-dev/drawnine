import type { ParsedDecklist } from '@app/decklist-parser';
import type { LayoutOptions } from '@app/pdf-renderer';
import type { ScryfallLanguage } from '@app/scryfall-client';

export interface ProxyOptions extends LayoutOptions {
  /** Print both faces of double-faced cards (default true). */
  printBothFaces: boolean;
  /**
   * Language of the Scryfall images (default `en`). Cards not printed in this
   * language fall back to English with a `language-unavailable` warning.
   */
  lang: ScryfallLanguage;
}

export type ProxyProgress =
  | { stage: 'reading-art' }
  | { stage: 'resolving-cards'; total: number }
  | { stage: 'localizing-cards'; total: number }
  | { stage: 'downloading-images'; done: number; total: number }
  | { stage: 'rendering'; cards: number };

export interface ProxyRequest {
  decklist: string;
  /** Optional .zip with custom art. */
  art?: Uint8Array;
  options?: Partial<ProxyOptions>;
  /** Optional progress callback (the CLI prints it to stderr). */
  onProgress?: (progress: ProxyProgress) => void;
}

export type ProxyWarningCode =
  | 'unsafe-path'
  | 'symlink'
  | 'encrypted'
  | 'corrupt-entry'
  | 'not-an-image'
  | 'low-resolution'
  | 'duplicate-name'
  | 'unused-art'
  | 'missing-image'
  | 'language-unavailable';

export interface ProxyWarning {
  /** Stable code, suitable as an i18n key. */
  code: ProxyWarningCode;
  /** Human-readable message (Spanish). */
  message: string;
  card?: string;
  file?: string;
}

export interface ProxyResult {
  pdf: Uint8Array;
  pageCount: number;
  cardCount: number;
  warnings: ProxyWarning[];
}

export interface ProxyServiceOptions {
  /** Maximum number of printed cards (faces) per request. */
  maxCards: number;
}

export type { ParsedDecklist, ScryfallLanguage };
