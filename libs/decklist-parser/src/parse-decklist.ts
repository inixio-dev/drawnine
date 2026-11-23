import { DecklistParseError } from './errors.js';
import { DECKLIST_ERROR_MESSAGES } from './messages.js';
import type {
  DeckSection,
  DecklistEntry,
  DecklistErrorCode,
  DecklistLineError,
  ParsedDecklist,
} from './types.js';

export const MAX_QUANTITY_PER_LINE = 999;

const SECTION_HEADERS: Record<string, DeckSection> = {
  deck: 'main',
  main: 'main',
  maindeck: 'main',
  mainboard: 'main',
  sideboard: 'sideboard',
  commander: 'commander',
  companion: 'companion',
};

/** `4 Name`, `4x Name`, `SB: 4 Name`. */
const LINE_RE = /^(?<sb>SB:\s*)?(?<qty>\S+?)x?\s+(?<rest>.*)$/i;
/** Arena/MTGO suffix: `(M10) 146` or `(M10)`. */
const SET_SUFFIX_RE =
  /\s+\((?<set>[A-Za-z0-9]{2,6})\)(?:\s+(?<cn>[A-Za-z0-9★-]+))?$/;
const FOIL_RE = /\s*\*F\*\s*/gi;
const SPLIT_RE = /\s*\/{1,2}\s*/g;

/**
 * Parses a decklist in plain text or Arena/MTGO format.
 * Never throws on a malformed line: it is reported in `errors` instead.
 */
export function parseDecklist(text: string): ParsedDecklist {
  if (typeof text !== 'string') {
    throw new DecklistParseError('Decklist must be a string');
  }

  const entries: DecklistEntry[] = [];
  const errors: DecklistLineError[] = [];
  let section: DeckSection = 'main';
  let sawHeader = false;

  const lines = text.split(/\r?\n/);
  lines.forEach((raw, index) => {
    const line = index + 1;
    const content = raw.trim();

    if (content === '') {
      // A blank line separates main deck and sideboard, unless the list uses headers.
      if (!sawHeader && section === 'main' && entries.length > 0) {
        section = 'sideboard';
      }
      return;
    }

    const header = parseHeader(content);
    if (header !== null) {
      if (header !== 'comment') {
        section = header;
        sawHeader = true;
      }
      return;
    }

    const result = parseCardLine(content, line, section);
    if ('code' in result) {
      errors.push(result);
    } else {
      entries.push(result);
    }
  });

  return { entries, errors };
}

/** Returns a section, `'comment'` for comment lines, or null for card lines. */
function parseHeader(content: string): DeckSection | 'comment' | null {
  const isComment = content.startsWith('#') || content.startsWith('//');
  const bare = content
    .replace(/^(#|\/\/)\s*/, '')
    .replace(/:$/, '')
    .trim()
    .toLowerCase();
  const section = SECTION_HEADERS[bare];
  if (section) return section;
  return isComment ? 'comment' : null;
}

function parseCardLine(
  content: string,
  line: number,
  section: DeckSection,
): DecklistEntry | DecklistLineError {
  const error = (code: DecklistErrorCode): DecklistLineError => ({
    line,
    content,
    code,
    reason: DECKLIST_ERROR_MESSAGES[code],
  });

  const match = LINE_RE.exec(content);
  if (!match?.groups) {
    return error(/^\d/.test(content) ? 'missing-name' : 'missing-quantity');
  }
  const { sb, qty = '', rest = '' } = match.groups;

  if (!/^\d+$/.test(qty)) {
    return error(/^-?\d/.test(qty) ? 'invalid-quantity' : 'missing-quantity');
  }
  const quantity = Number(qty);
  if (quantity < 1) return error('invalid-quantity');
  if (quantity > MAX_QUANTITY_PER_LINE) return error('quantity-too-large');

  let name = rest.replace(FOIL_RE, ' ').trim();
  let setCode: string | undefined;
  let collectorNumber: string | undefined;

  const setMatch = SET_SUFFIX_RE.exec(name);
  if (setMatch?.groups) {
    setCode = setMatch.groups.set?.toUpperCase();
    collectorNumber = setMatch.groups.cn;
    name = name.slice(0, setMatch.index).trim();
  }

  name = name.replace(SPLIT_RE, ' // ').replace(/\s+/g, ' ').trim();
  if (name === '') return error('missing-name');

  return {
    line,
    quantity,
    name,
    section: sb ? 'sideboard' : section,
    ...(setCode !== undefined && { setCode }),
    ...(collectorNumber !== undefined && { collectorNumber }),
  };
}
