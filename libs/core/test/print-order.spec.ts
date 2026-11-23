import { describe, expect, it } from 'vitest';
import { type DecklistEntry, printOrder } from '@app/core';

const entry = (
  name: string,
  section: DecklistEntry['section'],
): DecklistEntry => ({ line: 1, quantity: 1, name, section });

describe('printOrder', () => {
  it('moves commanders to the front, keeping decklist order otherwise', () => {
    const entries = [
      entry('Lurrus', 'companion'),
      entry('Atraxa', 'commander'),
      entry('Sol Ring', 'main'),
      entry('Tymna', 'commander'),
      entry('Swords', 'sideboard'),
    ];
    expect(printOrder(entries).map((e) => e.name)).toEqual([
      'Atraxa',
      'Tymna',
      'Lurrus',
      'Sol Ring',
      'Swords',
    ]);
  });

  it('keeps decks without a commander unchanged', () => {
    const entries = [entry('Opt', 'main'), entry('Bolt', 'sideboard')];
    expect(printOrder(entries)).toEqual(entries);
  });
});
