import { idbStoreFactory } from "./idbStore";
import type { LocalStoreFactory } from "./store";

/** SPENDLY-594 — the web store: IndexedDB (never expo-sqlite on web). */
export const LOCAL_DB_NAME = "spendly-readmodel";

/**
 * SPENDLY-699: a static import. The web export is a single bundle
 * (`app.json` web.output "single"), and a module reached only through a
 * dynamic `import()` isn't in it, so the copy failed to open on web with
 * "Requiring unknown module".
 */
export async function platformStoreFactory(): Promise<LocalStoreFactory> {
  return idbStoreFactory({ indexedDB: globalThis.indexedDB });
}
