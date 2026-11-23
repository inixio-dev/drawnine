export class ScryfallError extends Error {
  override readonly name: string = 'ScryfallError';

  constructor(
    message: string,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class ScryfallRateLimitError extends ScryfallError {
  override readonly name = 'ScryfallRateLimitError';
}
