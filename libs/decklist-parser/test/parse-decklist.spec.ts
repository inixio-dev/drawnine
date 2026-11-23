import { describe, expect, it } from 'vitest';
import { DecklistParseError, parseDecklist } from '@app/decklist-parser';

describe('parseDecklist', () => {
  it('returns no entries and no errors for an empty decklist', () => {
    expect(parseDecklist('')).toEqual({ entries: [], errors: [] });
    expect(parseDecklist('\n\n  \n')).toEqual({ entries: [], errors: [] });
  });

  it('throws only for non-string input', () => {
    expect(() => parseDecklist(42 as unknown as string)).toThrow(
      DecklistParseError,
    );
  });

  describe('plain text', () => {
    it('parses `4 Lightning Bolt`', () => {
      expect(parseDecklist('4 Lightning Bolt').entries).toEqual([
        { line: 1, quantity: 4, name: 'Lightning Bolt', section: 'main' },
      ]);
    });

    it('accepts the `4x` form and extra whitespace', () => {
      expect(
        parseDecklist('  4x   Lightning   Bolt  ').entries[0],
      ).toMatchObject({ quantity: 4, name: 'Lightning Bolt' });
    });

    it('parses quantities greater than 9', () => {
      expect(parseDecklist('12 Island\n100 Relentless Rats').entries).toEqual([
        { line: 1, quantity: 12, name: 'Island', section: 'main' },
        { line: 2, quantity: 100, name: 'Relentless Rats', section: 'main' },
      ]);
    });

    it('handles CRLF line endings', () => {
      const { entries } = parseDecklist('4 Lightning Bolt\r\n2 Opt\r\n');
      expect(entries.map((e) => e.name)).toEqual(['Lightning Bolt', 'Opt']);
    });
  });

  describe('Arena / MTGO', () => {
    it('parses set code and collector number', () => {
      expect(parseDecklist('4 Lightning Bolt (M10) 146').entries[0]).toEqual({
        line: 1,
        quantity: 4,
        name: 'Lightning Bolt',
        section: 'main',
        setCode: 'M10',
        collectorNumber: '146',
      });
    });

    it('parses a set code without collector number', () => {
      expect(parseDecklist('4 Lightning Bolt (m10)').entries[0]).toMatchObject({
        name: 'Lightning Bolt',
        setCode: 'M10',
      });
      expect(
        parseDecklist('4 Lightning Bolt (m10)').entries[0],
      ).not.toHaveProperty('collectorNumber');
    });

    it('keeps alphanumeric collector numbers', () => {
      expect(
        parseDecklist('1 Sol Ring (PLST) C21-263').entries[0],
      ).toMatchObject({ setCode: 'PLST', collectorNumber: 'C21-263' });
    });

    it('parses the MTGO `SB:` prefix as sideboard', () => {
      expect(parseDecklist('SB: 2 Pyroblast').entries[0]).toMatchObject({
        quantity: 2,
        name: 'Pyroblast',
        section: 'sideboard',
      });
    });
  });

  describe('names with //', () => {
    it('keeps `A // B` names', () => {
      expect(parseDecklist('2 Fire // Ice').entries[0]?.name).toBe(
        'Fire // Ice',
      );
    });

    it('normalizes `A/B` and `A//B` to `A // B`', () => {
      const { entries } = parseDecklist('2 Fire/Ice\n1 Wear//Tear');
      expect(entries.map((e) => e.name)).toEqual([
        'Fire // Ice',
        'Wear // Tear',
      ]);
    });

    it('parses double-faced names with set info', () => {
      expect(
        parseDecklist('4 Delver of Secrets // Insectile Aberration (ISD) 51')
          .entries[0],
      ).toMatchObject({
        name: 'Delver of Secrets // Insectile Aberration',
        setCode: 'ISD',
        collectorNumber: '51',
      });
    });
  });

  describe('sections', () => {
    it('handles Deck, Sideboard, Commander and Companion headers', () => {
      const text = [
        'Commander',
        "1 Atraxa, Praetors' Voice",
        '',
        'Companion',
        '1 Lurrus of the Dream-Den',
        '',
        'Deck',
        '1 Sol Ring',
        '',
        'Sideboard',
        '1 Swords to Plowshares',
      ].join('\n');
      expect(
        parseDecklist(text).entries.map((e) => [e.name, e.section, e.line]),
      ).toEqual([
        ["Atraxa, Praetors' Voice", 'commander', 2],
        ['Lurrus of the Dream-Den', 'companion', 5],
        ['Sol Ring', 'main', 8],
        ['Swords to Plowshares', 'sideboard', 11],
      ]);
    });

    it('accepts headers with a trailing colon and comment-style headers', () => {
      const { entries } = parseDecklist('// Sideboard\n1 Opt\nDeck:\n1 Island');
      expect(entries.map((e) => e.section)).toEqual(['sideboard', 'main']);
    });

    it('treats a blank line as the sideboard separator', () => {
      const { entries } = parseDecklist(
        '4 Lightning Bolt\n\n2 Pyroblast\n\n1 Opt',
      );
      expect(entries.map((e) => e.section)).toEqual([
        'main',
        'sideboard',
        'sideboard',
      ]);
    });

    it('ignores leading blank lines', () => {
      const { entries } = parseDecklist('\n\n4 Lightning Bolt');
      expect(entries[0]).toMatchObject({ section: 'main', line: 3 });
    });

    it('ignores comment lines', () => {
      const { entries, errors } = parseDecklist(
        '# burn\n// cheap stuff\n4 Opt',
      );
      expect(errors).toEqual([]);
      expect(entries).toHaveLength(1);
    });
  });

  it('ignores *F* foil markers', () => {
    expect(parseDecklist('4 Lightning Bolt *F*').entries[0]?.name).toBe(
      'Lightning Bolt',
    );
    expect(
      parseDecklist('4 Lightning Bolt (M10) 146 *F*').entries[0],
    ).toMatchObject({
      name: 'Lightning Bolt',
      setCode: 'M10',
      collectorNumber: '146',
    });
  });

  describe('invalid lines', () => {
    it('reports line number, content, code and reason without throwing', () => {
      const text =
        '4 Lightning Bolt\nLightning Bolt\n0 Opt\n-1 Opt\n4\n1000 Island';
      const { entries, errors } = parseDecklist(text);

      expect(entries).toHaveLength(1);
      expect(errors.map((e) => [e.line, e.code])).toEqual([
        [2, 'missing-quantity'],
        [3, 'invalid-quantity'],
        [4, 'invalid-quantity'],
        [5, 'missing-name'],
        [6, 'quantity-too-large'],
      ]);
      expect(errors[0]).toMatchObject({ content: 'Lightning Bolt' });
      expect(errors.every((e) => e.reason.length > 0)).toBe(true);
    });

    it('reports a line with only a foil marker as missing name', () => {
      expect(parseDecklist('4 *F*').errors[0]?.code).toBe('missing-name');
    });
  });
});
