import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  ArtArchiveError,
  ArtArchiveLimitError,
  CardsNotFoundError,
  EmptyDecklistError,
  InvalidDecklistError,
  LayoutError,
  ScryfallError,
  ScryfallRateLimitError,
  TooManyCardsError,
} from '@app/core';
import { toHttp } from '../../src/common/domain-exception.filter.js';

describe('toHttp', () => {
  it.each([
    [new InvalidDecklistError([]), HttpStatus.UNPROCESSABLE_ENTITY],
    [new EmptyDecklistError(), HttpStatus.UNPROCESSABLE_ENTITY],
    [new TooManyCardsError(10, 5), HttpStatus.UNPROCESSABLE_ENTITY],
    [new CardsNotFoundError(['X']), HttpStatus.UNPROCESSABLE_ENTITY],
    [new LayoutError('x'), HttpStatus.BAD_REQUEST],
    [new ArtArchiveError('x'), HttpStatus.BAD_REQUEST],
    [new ArtArchiveLimitError('x'), HttpStatus.PAYLOAD_TOO_LARGE],
    [new ScryfallError('x'), HttpStatus.BAD_GATEWAY],
    [new ScryfallRateLimitError('x'), HttpStatus.BAD_GATEWAY],
  ])('maps %s', (error, status) => {
    expect(toHttp(error).status).toBe(status);
  });

  it('includes the invalid lines and missing cards', () => {
    const lineError = {
      line: 1,
      content: 'x',
      code: 'missing-quantity' as const,
      reason: 'r',
    };
    expect(toHttp(new InvalidDecklistError([lineError])).body.errors).toEqual([
      lineError,
    ]);
    expect(toHttp(new CardsNotFoundError(['Nope'])).body.cards).toEqual([
      'Nope',
    ]);
  });
});
