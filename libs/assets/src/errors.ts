export class ArtArchiveError extends Error {
  override readonly name: string = 'ArtArchiveError';
}

export class ArtArchiveLimitError extends ArtArchiveError {
  override readonly name = 'ArtArchiveLimitError';
}
