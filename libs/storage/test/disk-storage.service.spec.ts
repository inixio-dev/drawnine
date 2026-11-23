import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DiskStorageService, StorageError } from '@drawnine/storage';

describe('DiskStorageService', () => {
  let root: string;
  let storage: DiskStorageService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'drawnine-storage-'));
    storage = new DiskStorageService(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('stores and reads bytes under nested keys', async () => {
    await storage.put('images/a.png', new Uint8Array([1, 2, 3]));
    expect(await storage.exists('images/a.png')).toBe(true);
    expect(await storage.get('images/a.png')).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it('returns undefined for missing keys', async () => {
    expect(await storage.get('missing')).toBeUndefined();
    expect(await storage.exists('missing')).toBe(false);
  });

  it('rejects keys that escape the root', async () => {
    await expect(storage.put('../evil', new Uint8Array())).rejects.toThrow(
      StorageError,
    );
  });
});
