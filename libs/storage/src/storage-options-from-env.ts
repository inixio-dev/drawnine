import { StorageError } from './errors.js';
import type { StorageModuleOptions } from './storage.module.js';

/** Builds StorageModule options from environment-style variables. */
export function storageOptionsFromEnv(
  env: Record<string, string | undefined>,
  defaultDiskRoot: string,
): StorageModuleOptions {
  const driver = env.STORAGE_DRIVER || 'disk';
  if (driver === 'disk') {
    return { driver: 'disk', root: env.STORAGE_DISK_ROOT || defaultDiskRoot };
  }
  if (driver === 's3') {
    const bucket = env.S3_BUCKET;
    if (!bucket)
      throw new StorageError('S3_BUCKET is required when STORAGE_DRIVER=s3');
    return {
      driver: 's3',
      bucket,
      prefix: env.S3_PREFIX || undefined,
      region: env.S3_REGION || undefined,
      endpoint: env.S3_ENDPOINT || undefined,
      forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    };
  }
  throw new StorageError(
    `Unknown STORAGE_DRIVER "${driver}" (use "disk" or "s3")`,
  );
}
