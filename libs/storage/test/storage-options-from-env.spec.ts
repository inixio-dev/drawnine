import { describe, expect, it } from 'vitest';
import { StorageError, storageOptionsFromEnv } from '@app/storage';

describe('storageOptionsFromEnv', () => {
  it('defaults to disk with the given root', () => {
    expect(storageOptionsFromEnv({}, '/tmp/x')).toEqual({
      driver: 'disk',
      root: '/tmp/x',
    });
    expect(
      storageOptionsFromEnv({ STORAGE_DISK_ROOT: '/data' }, '/tmp/x'),
    ).toEqual({
      driver: 'disk',
      root: '/data',
    });
  });

  it('builds S3 options', () => {
    expect(
      storageOptionsFromEnv(
        {
          STORAGE_DRIVER: 's3',
          S3_BUCKET: 'b',
          S3_PREFIX: 'p',
          S3_FORCE_PATH_STYLE: 'true',
        },
        '/tmp/x',
      ),
    ).toEqual({
      driver: 's3',
      bucket: 'b',
      prefix: 'p',
      region: undefined,
      endpoint: undefined,
      forcePathStyle: true,
    });
  });

  it('rejects missing bucket and unknown drivers', () => {
    expect(() => storageOptionsFromEnv({ STORAGE_DRIVER: 's3' }, '/x')).toThrow(
      StorageError,
    );
    expect(() =>
      storageOptionsFromEnv({ STORAGE_DRIVER: 'ftp' }, '/x'),
    ).toThrow(StorageError);
  });
});
