import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { StorageError } from './errors.js';
import { StorageService } from './storage.service.js';

/** Only `send` is used, which keeps the service easy to test. */
export type S3SendClient = Pick<S3Client, 'send'>;

export class S3StorageService extends StorageService {
  private readonly prefix: string;

  constructor(
    private readonly client: S3SendClient,
    private readonly bucket: string,
    prefix = '',
  ) {
    super();
    this.prefix = prefix && !prefix.endsWith('/') ? `${prefix}/` : prefix;
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.keyFor(key) }),
      );
      if (!result.Body) return undefined;
      return await result.Body.transformToByteArray();
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw new StorageError(`Could not read ${key} from S3`, { cause: error });
    }
  }

  async put(key: string, value: Uint8Array): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.keyFor(key),
          Body: value,
        }),
      );
    } catch (error) {
      throw new StorageError(`Could not write ${key} to S3`, { cause: error });
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.keyFor(key) }),
      );
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw new StorageError(`Could not check ${key} in S3`, { cause: error });
    }
  }

  private keyFor(key: string): string {
    if (key.split('/').includes('..') || key.startsWith('/')) {
      throw new StorageError(`Invalid storage key: ${key}`);
    }
    return this.prefix + key;
  }
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name = 'name' in error ? error.name : undefined;
  const status =
    '$metadata' in error &&
    typeof error.$metadata === 'object' &&
    error.$metadata !== null &&
    'httpStatusCode' in error.$metadata
      ? error.$metadata.httpStatusCode
      : undefined;
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}
