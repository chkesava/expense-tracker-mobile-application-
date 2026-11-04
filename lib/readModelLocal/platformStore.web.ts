import type { LocalStoreFactory } from "./store";

/** SPENDLY-594 — the web store: IndexedDB (never expo-sqlite on web). */
export const LOCAL_DB_NAME = "spendly-readmodel";

export async function platformStoreFactory(): Promise<LocalStoreFactory> {
  const { idbStoreFactory } = await import("./idbStore");
  return idbStoreFactory({ indexedDB: globalThis.indexedDB });
}
