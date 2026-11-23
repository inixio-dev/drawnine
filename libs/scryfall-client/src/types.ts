/** Identifier accepted by `POST /cards/collection`. */
export type CardIdentifier =
  | { name: string }
  | { name: string; set: string }
  | { set: string; collector_number: string }
  | { id: string };

export type ImageVersion = 'png' | 'large' | 'normal';

export type ScryfallImageUris = Partial<Record<ImageVersion | 'small', string>>;

export interface ScryfallCardFace {
  name: string;
  image_uris?: ScryfallImageUris;
}

/** Subset of the Scryfall card object that DrawNine uses. */
export interface ScryfallCard {
  id: string;
  name: string;
  set: string;
  collector_number: string;
  layout: string;
  /** Printing language (Scryfall code, e.g. `en`, `es`). */
  lang?: string;
  oracle_id?: string;
  /** `missing` / `placeholder` mean Scryfall has no real scan of this printing. */
  image_status?: string;
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];
}

/** Language codes Scryfall uses for printings. */
export const SCRYFALL_LANGUAGES = [
  'en',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'ja',
  'ko',
  'ru',
  'zhs',
  'zht',
  'he',
  'la',
  'grc',
  'ar',
  'sa',
  'ph',
  'qya',
] as const;

export type ScryfallLanguage = (typeof SCRYFALL_LANGUAGES)[number];

export function isScryfallLanguage(value: string): value is ScryfallLanguage {
  return (SCRYFALL_LANGUAGES as readonly string[]).includes(value);
}

export interface LocalizedPrintOptions {
  /** Only accept the same set and collector number (no other printings). */
  samePrintingOnly?: boolean;
}

export interface CollectionMatch {
  identifier: CardIdentifier;
  card: ScryfallCard;
}

export interface CollectionResult {
  found: CollectionMatch[];
  notFound: CardIdentifier[];
}

export interface CardFaceImage {
  /** Face name (or card name for single-image cards). */
  faceName: string;
  url: string;
}

/** Byte cache for metadata and images. Implemented outside this lib. */
export interface ScryfallCache {
  get(key: string): Promise<Uint8Array | undefined>;
  set(key: string, value: Uint8Array): Promise<void>;
}

export interface ScryfallClientOptions {
  userAgent: string;
  baseUrl?: string;
  cache?: ScryfallCache;
  /** How long cached card metadata stays valid. Default: 7 days. */
  metadataTtlMs?: number;
  /** Retries on 429, 5xx and network errors. Default: 4. */
  maxRetries?: number;
  /** Injectable for tests. Defaults to global fetch. */
  fetch?: typeof fetch;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable for tests. */
  now?: () => number;
}
