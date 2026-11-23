import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { S3StorageService, StorageError } from '@app/storage';

const notFound = (name: string) =>
  Object.assign(new Error(name), { name, $metadata: { httpStatusCode: 404 } });

describe('S3StorageService', () => {
  const send = vi.fn();
  let storage: S3StorageService;

  beforeEach(() => {
    send.mockReset();
    storage = new S3StorageService({ send } as never, 'bucket', 'cache');
  });

  it('puts objects under the prefix', async () => {
    send.mockResolvedValue({});
    await storage.put('images/a.png', new Uint8Array([1]));
    const command = send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'bucket',
      Key: 'cache/images/a.png',
    });
  });

  it('gets object bytes', async () => {
    send.mockResolvedValue({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2]) },
    });
    expect(await storage.get('a')).toEqual(new Uint8Array([1, 2]));
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetObjectCommand);
  });

  it('returns undefined / false for missing keys', async () => {
    send.mockRejectedValueOnce(notFound('NoSuchKey'));
    expect(await storage.get('missing')).toBeUndefined();
    send.mockRejectedValueOnce(notFound('NotFound'));
    expect(await storage.exists('missing')).toBe(false);
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(HeadObjectCommand);
  });

  it('returns true when the object exists', async () => {
    send.mockResolvedValue({});
    expect(await storage.exists('a')).toBe(true);
  });

  it('wraps other errors in StorageError', async () => {
    send.mockRejectedValue(new Error('AccessDenied'));
    await expect(storage.get('a')).rejects.toBeInstanceOf(StorageError);
    await expect(storage.put('a', new Uint8Array())).rejects.toBeInstanceOf(
      StorageError,
    );
    await expect(storage.exists('a')).rejects.toBeInstanceOf(StorageError);
  });

  it('rejects keys with `..`', async () => {
    await expect(storage.put('../x', new Uint8Array())).rejects.toBeInstanceOf(
      StorageError,
    );
    expect(send).not.toHaveBeenCalled();
  });
});
