import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssetsModule } from '@app/assets';
import { ScryfallModule } from '@app/scryfall-client';
import { StorageService } from '@app/storage';
import {
  DEFAULT_MAX_CARDS,
  PROXY_SERVICE_OPTIONS,
  ProxyService,
} from './proxy.service.js';
import { ScryfallStorageCache } from './scryfall-storage-cache.js';
import type { ProxyServiceOptions } from './types.js';
import { defaultUserAgent } from './version.js';

/**
 * Requires ConfigModule (global) and StorageModule.forRoot() in the importing app.
 */
@Module({
  imports: [
    ScryfallModule.forRootAsync({
      inject: [ConfigService, StorageService],
      useFactory: (config: ConfigService, storage: StorageService) => ({
        userAgent:
          config.get<string>('SCRYFALL_USER_AGENT') || defaultUserAgent(),
        baseUrl: config.get<string>('SCRYFALL_BASE_URL') || undefined,
        cache: new ScryfallStorageCache(storage),
      }),
    }),
    AssetsModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: definedOnly({
          maxCompressedBytes: optionalLimitFrom(
            config,
            'ART_ZIP_MAX_COMPRESSED_BYTES',
          ),
          maxUncompressedBytes: numberFrom(
            config,
            'ART_ZIP_MAX_UNCOMPRESSED_BYTES',
          ),
          maxEntries: numberFrom(config, 'ART_ZIP_MAX_ENTRIES'),
        }),
      }),
    }),
  ],
  providers: [
    {
      provide: PROXY_SERVICE_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ProxyServiceOptions => ({
        maxCards: numberFrom(config, 'PROXY_MAX_CARDS') ?? DEFAULT_MAX_CARDS,
      }),
    },
    ProxyService,
  ],
  exports: [ProxyService],
})
export class CoreModule {}

function numberFrom(config: ConfigService, key: string): number | undefined {
  const raw = config.get<string | number>(key);
  if (raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${key} must be a positive number, got "${String(raw)}"`);
  }
  return value;
}

/** Like numberFrom, but `0` means "no limit" (returned as `null`). */
function optionalLimitFrom(
  config: ConfigService,
  key: string,
): number | null | undefined {
  const raw = config.get<string | number>(key);
  if (raw !== undefined && Number(raw) === 0 && String(raw).trim() !== '') {
    return null;
  }
  return numberFrom(config, key);
}

function definedOnly<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
