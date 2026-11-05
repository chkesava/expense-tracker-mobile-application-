import type { LocalStoreFactory } from "./store";

/**
 * SPENDLY-594 — the native store: SQLite (expo-sqlite, a native module).
 * Web uses `platformStore.web.ts` (IndexedDB), so Metro never bundles
 * expo-sqlite (and its WebAssembly) for web.
 */
export const LOCAL_DB_NAME = "spendly-readmodel.db";

export async function platformStoreFactory(): Promise<LocalStoreFactory> {
  const [{ sqliteStoreFactory }, SQLite] = await Promise.all([import("./sqliteStore"), import("expo-sqlite")]);
  return sqliteStoreFactory({
    async openDb() {
      const db = await SQLite.openDatabaseAsync(LOCAL_DB_NAME);
      await db.execAsync("pragma journal_mode = wal");
      return {
        execAsync: (sql) => db.execAsync(sql),
        runAsync: async (sql, ...params) => ({ changes: (await db.runAsync(sql, params)).changes }),
        getAllAsync: (sql, ...params) => db.getAllAsync(sql, params),
        withTransactionAsync: (task) => db.withTransactionAsync(task),
        closeAsync: () => db.closeAsync(),
      };
    },
    deleteDb: () => SQLite.deleteDatabaseAsync(LOCAL_DB_NAME),
  });
}
