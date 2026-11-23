import type { ScryfallCache } from '@drawnine/scryfall-client';
import type { StorageService } from '@drawnine/storage';

/** Adapts a StorageService into the cache interface the Scryfall client expects. */
export class ScryfallStorageCache implements ScryfallCache {
  constructor(
    private readonly storage: StorageService,
    private readonly prefix = 'scryfall/',
  ) {}

  get(key: string): Promise<Uint8Array | undefined> {
    return this.storage.get(this.prefix + key);
  }

  set(key: string, value: Uint8Array): Promise<void> {
    return this.storage.put(this.prefix + key, value);
  }
}
