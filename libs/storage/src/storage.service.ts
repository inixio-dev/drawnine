/**
 * Byte storage abstraction. Abstract class so it can be used as a Nest
 * injection token while staying framework-agnostic.
 */
export abstract class StorageService {
  abstract get(key: string): Promise<Uint8Array | undefined>;
  abstract put(key: string, value: Uint8Array): Promise<void>;
  abstract exists(key: string): Promise<boolean>;
}
