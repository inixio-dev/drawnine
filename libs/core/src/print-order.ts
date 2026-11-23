import type { DecklistEntry } from '@drawnine/decklist-parser';

/**
 * Order in which entries are printed: decklist order, with the commander(s)
 * moved to the front so they come first in the PDF.
 */
export function printOrder(entries: readonly DecklistEntry[]): DecklistEntry[] {
  return [
    ...entries.filter((e) => e.section === 'commander'),
    ...entries.filter((e) => e.section !== 'commander'),
  ];
}
