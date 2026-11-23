export const SCRYFALL_BASE_URL = 'https://api.scryfall.com';
/** Maximum identifiers per `POST /cards/collection` request. */
export const COLLECTION_BATCH_SIZE = 75;
/** Scryfall asks for at most ~10 requests per second. */
export const MIN_REQUEST_INTERVAL_MS = 100;
export const DEFAULT_MAX_RETRIES = 4;
export const BASE_BACKOFF_MS = 1000;
export const DEFAULT_METADATA_TTL_MS = 7 * 24 * 60 * 60 * 1000;
