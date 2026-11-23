/** Raised only for unrecoverable input (e.g. non-string input), never for a malformed line. */
export class DecklistParseError extends Error {
  override readonly name = 'DecklistParseError';
}
