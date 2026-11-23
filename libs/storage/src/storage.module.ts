import { S3Client } from '@aws-sdk/client-s3';
import { type DynamicModule, Module } from '@nestjs/common';
import { DiskStorageService } from './disk-storage.service.js';
import { S3StorageService } from './s3-storage.service.js';
import { StorageService } from './storage.service.js';

export type StorageModuleOptions =
  | { driver: 'disk'; root: string }
  | {
      driver: 's3';
      bucket: string;
      prefix?: string;
      region?: string;
      /** Custom endpoint for S3-compatible services (MinIO, R2…). */
      endpoint?: string;
      forcePathStyle?: boolean;
    };

/** Global: apps pick the implementation once, the rest inject StorageService. */
@Module({})
export class StorageModule {
  static forRoot(options: StorageModuleOptions): DynamicModule {
    return {
      module: StorageModule,
      global: true,
      providers: [
        { provide: StorageService, useFactory: () => createStorage(options) },
      ],
      exports: [StorageService],
    };
  }
}

export function createStorage(options: StorageModuleOptions): StorageService {
  switch (options.driver) {
    case 'disk':
      return new DiskStorageService(options.root);
    case 's3':
      // Credentials come from the default AWS provider chain (env, profile, role).
      return new S3StorageService(
        new S3Client({
          region: options.region,
          endpoint: options.endpoint,
          forcePathStyle: options.forcePathStyle,
        }),
        options.bucket,
        options.prefix,
      );
  }
}
