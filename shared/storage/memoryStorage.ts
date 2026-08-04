/**
 * Minimal key/value storage for Phase 0 pure shared code.
 * Later phases can swap this for MMKV / SecureStore adapters.
 */
const store = new Map<string, string>();

export const memoryStorage = {
  getItem(key: string): string | null {
    return store.has(key) ? store.get(key)! : null;
  },
  setItem(key: string, value: string): void {
    store.set(key, value);
  },
  removeItem(key: string): void {
    store.delete(key);
  },
  clear(): void {
    store.clear();
  },
};

export type KvStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

let activeStorage: KvStorage = memoryStorage;

/** Inject platform storage (e.g. MMKV) in later phases. */
export function setSharedStorage(storage: KvStorage): void {
  activeStorage = storage;
}

export function getSharedStorage(): KvStorage {
  return activeStorage;
}
