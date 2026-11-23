import {
  type DecklistLineError,
  type ProxyWarningCode,
  SCRYFALL_LANGUAGES,
} from '@app/core';

const AUTHOR = '@inixio-dev';
const AUTHOR_URL = 'https://github.com/inixio-dev';

/** User-facing texts (English). Kept in one place so they can be moved to i18n later. */
export const messages = {
  disclaimer:
    'DrawNine generates proxies for personal use and deck playtesting only. Selling them or passing them off as real cards is not allowed.',
  credits: `DrawNine by ${AUTHOR} (${AUTHOR_URL})`,
  buildDescription:
    'Generate a printable A4 PDF of proxies to playtest a deck (personal use only).',
  parseDescription: 'Parse a decklist and print the result and any errors.',
  artOption: '.zip file with custom art',
  outputOption: 'Output PDF path',
  gapOption: 'Gap between cards in mm (0–10)',
  noCutMarksOption: 'Do not draw cut marks',
  bleedOption: 'Bleed in mm',
  singleFaceOption: 'Print only the front face of double-faced cards',
  langOption: `Card language (${SCRYFALL_LANGUAGES.join(', ')}); cards not printed in it fall back to English`,
  invalidLang: (value: string) =>
    `Invalid value for --lang: "${value}". Use one of: ${SCRYFALL_LANGUAGES.join(', ')}`,
  invalidNumber: (flag: string, value: string) =>
    `Invalid value for ${flag}: "${value}"`,
  invalidDecklist: (count: number) =>
    `The decklist has ${count} line(s) with errors:`,
  lineError: (line: number, reason: string, content: string) =>
    `  Line ${line}: ${reason} → "${content}"`,
  emptyDecklist: 'The decklist contains no cards.',
  tooManyCards: (count: number, max: number) =>
    `The decklist has ${count} cards to print; the maximum is ${max}.`,
  cardsNotFound: (names: readonly string[]) =>
    `Not found on Scryfall: ${names.join(', ')}`,
  invalidLayout: 'The gap and bleed options do not fit on an A4 page.',
  network:
    'Error contacting Scryfall. Check your connection and try again later.',
  invalidZip: 'The art file is not a valid .zip.',
  zipTooLarge:
    'The art .zip exceeds the allowed limits (size or number of files).',
  cannotRead: (path: string) => `Cannot read file: ${path}`,
  cannotWrite: (path: string) => `Cannot write file: ${path}`,
  readingArt: 'Reading art…',
  resolvingCards: (count: number) => `Looking up ${count} card(s) on Scryfall…`,
  localizingCards: (count: number) =>
    `Looking up translated printings for ${count} card(s)…`,
  downloadingImages: (done: number, total: number) =>
    `Downloading images ${done}/${total}`,
  rendering: (cards: number) => `Rendering PDF with ${cards} card(s)…`,
  warning: (text: string) => `⚠ ${text}`,
  written: (path: string, pages: number, cards: number) =>
    `PDF written to ${path} (${cards} card(s), ${pages} page(s))`,
} as const;

/** English texts for the decklist parser error codes (the libs default to Spanish). */
const LINE_ERROR_REASONS: Record<string, string> = {
  'missing-quantity': 'Missing quantity (for example: "4 Lightning Bolt").',
  'invalid-quantity': 'Quantity must be a whole number greater than 0.',
  'quantity-too-large': 'Quantity is too large.',
  'missing-name': 'Missing card name.',
};

/** English texts for the warning codes produced by core (the libs default to Spanish). */
const WARNING_MESSAGES: Record<ProxyWarningCode, string> = {
  'unsafe-path': 'Path not allowed in the .zip; ignored.',
  symlink: 'Symbolic links are not allowed; ignored.',
  encrypted: 'Encrypted file; ignored.',
  'corrupt-entry': 'Corrupt file or unsupported compression format; ignored.',
  'not-an-image': 'Not a valid image; ignored.',
  'low-resolution':
    'Low resolution (at least 744×1039 px recommended); it may look pixelated when printed.',
  'duplicate-name': 'Several images match the same card; using the last one.',
  'unused-art': 'This art does not match any card in the decklist.',
  'missing-image': 'Scryfall has no image for this card; skipped.',
  'language-unavailable':
    'Not available in the requested language; using English.',
};

export function lineErrorReason(error: DecklistLineError): string {
  return LINE_ERROR_REASONS[error.code] ?? error.reason;
}

export function warningMessage(
  code: ProxyWarningCode,
  fallback: string,
): string {
  return WARNING_MESSAGES[code] ?? fallback;
}
