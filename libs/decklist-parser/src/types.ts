export type DeckSection = 'main' | 'sideboard' | 'commander' | 'companion';

export interface DecklistEntry {
  /** 1-based line number in the original text. */
  line: number;
  quantity: number;
  /** Card name. Split/double-faced names are normalized to `A // B`. */
  name: string;
  section: DeckSection;
  /** Set code from Arena/MTGO lines, e.g. `M10`. */
  setCode?: string;
  /** Collector number from Arena/MTGO lines, e.g. `146`. */
  collectorNumber?: string;
}

export type DecklistErrorCode =
  | 'missing-quantity'
  | 'invalid-quantity'
  | 'quantity-too-large'
  | 'missing-name';

export interface DecklistLineError {
  /** 1-based line number in the original text. */
  line: number;
  content: string;
  /** Stable code, suitable as an i18n key. */
  code: DecklistErrorCode;
  /** Human-readable reason (Spanish). */
  reason: string;
}

export interface ParsedDecklist {
  entries: DecklistEntry[];
  errors: DecklistLineError[];
}
