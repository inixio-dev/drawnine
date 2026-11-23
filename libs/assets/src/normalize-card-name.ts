const EXTENSION_RE = /\.[a-z0-9]{1,5}$/i;
const SEPARATOR_RE = /\s*(?:\/\/|_+)\s*/g;

/**
 * Normalizes a card or file name for matching:
 * lowercase, accents stripped, `//` and `_` equivalent, extension removed.
 *
 * `Fire // Ice`, `Fire_Ice.png` and `fire _ ice.JPG` all become `fire // ice`.
 */
export function normalizeCardName(input: string): string {
  return input
    .trim()
    .replace(EXTENSION_RE, '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(SEPARATOR_RE, ' // ')
    .replace(/\s+/g, ' ')
    .trim();
}
