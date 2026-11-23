import type { DecklistLineError } from '@drawnine/decklist-parser';

/** The decklist has invalid lines; generation is aborted. */
export class InvalidDecklistError extends Error {
  override readonly name = 'InvalidDecklistError';

  constructor(readonly errors: readonly DecklistLineError[]) {
    super(`Decklist has ${errors.length} invalid line(s)`);
  }
}

export class EmptyDecklistError extends Error {
  override readonly name = 'EmptyDecklistError';

  constructor() {
    super('Decklist has no cards');
  }
}

export class TooManyCardsError extends Error {
  override readonly name = 'TooManyCardsError';

  constructor(
    readonly count: number,
    readonly max: number,
  ) {
    super(`Decklist has ${count} cards; the maximum is ${max}`);
  }
}

export class CardsNotFoundError extends Error {
  override readonly name = 'CardsNotFoundError';

  constructor(readonly names: readonly string[]) {
    super(`Cards not found: ${names.join(', ')}`);
  }
}
