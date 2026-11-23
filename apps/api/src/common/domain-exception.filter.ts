import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ArtArchiveError,
  ArtArchiveLimitError,
  CardsNotFoundError,
  EmptyDecklistError,
  InvalidDecklistError,
  LayoutError,
  ScryfallError,
  TooManyCardsError,
} from '@drawnine/core';
import { messages } from '../messages.js';

const DOMAIN_ERRORS = [
  InvalidDecklistError,
  EmptyDecklistError,
  TooManyCardsError,
  CardsNotFoundError,
  LayoutError,
  ArtArchiveError,
  ScryfallError,
] as const;

type DomainError = InstanceType<(typeof DOMAIN_ERRORS)[number]>;

/** Translates domain errors from core into HTTP responses. */
@Catch(...DOMAIN_ERRORS)
export class DomainExceptionFilter implements ExceptionFilter<DomainError> {
  catch(error: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = toHttp(error);
    response.status(status).json({ statusCode: status, ...body });
  }
}

export function toHttp(error: DomainError): {
  status: HttpStatus;
  body: Record<string, unknown>;
} {
  if (error instanceof InvalidDecklistError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      body: { message: messages.invalidDecklist, errors: error.errors },
    };
  }
  if (error instanceof EmptyDecklistError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      body: { message: messages.emptyDecklist },
    };
  }
  if (error instanceof TooManyCardsError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      body: { message: messages.tooManyCards(error.count, error.max) },
    };
  }
  if (error instanceof CardsNotFoundError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      body: { message: messages.cardsNotFound, cards: error.names },
    };
  }
  if (error instanceof LayoutError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      body: { message: messages.invalidLayout },
    };
  }
  if (error instanceof ArtArchiveLimitError) {
    return {
      status: HttpStatus.PAYLOAD_TOO_LARGE,
      body: { message: messages.artArchiveTooLarge, detail: error.message },
    };
  }
  if (error instanceof ArtArchiveError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      body: { message: messages.invalidArtArchive, detail: error.message },
    };
  }
  return {
    status: HttpStatus.BAD_GATEWAY,
    body: { message: messages.scryfallUnavailable },
  };
}
