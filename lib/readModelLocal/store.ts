/**
 * SPENDLY-594 (ADR v2 D1) — the on-device copy's storage interface.
 *
 * One store per device, owned by one uid at a time: opening it for another uid
 * wipes it first, so a previous user's rows can never be read (or linger after
 * a crash). `destroy` removes it entirely (sign-out, account deletion).
 * Backends: SQLite on native (`sqliteStore.ts`, one table per synced table with
 * its typed columns), IndexedDB on web (`idbStore.ts`), memory for tests.
 */

/** A read-model row as PostgREST returns it (the mapper's columns, `doc` included). */
export type LocalRow = { docId: string; syncedAt: string; row: Record<string, unknown> };

export interface LocalRowStore {
  readonly uid: string;
  put(table: string, rows: LocalRow[]): Promise<void>;
  remove(table: string, docIds: string[]): Promise<void>;
  clear(table: string): Promise<void>;
  all(table: string): Promise<LocalRow[]>;
  get(table: string, docIds: string[]): Promise<LocalRow[]>;
  count(table: string): Promise<number>;
  /** Keeps the newest `keep` rows by synced_at; returns how many were removed. */
  evictOldest(table: string, keep: number): Promise<number>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string | null): Promise<void>;
  close(): Promise<void>;
}

export interface LocalStoreFactory {
  /** Opens the device's store for `uid`, wiping it first if another uid owned it. */
  open(uid: string): Promise<LocalRowStore>;
  /** Removes the store and everything in it. Safe when there is none. */
  destroy(): Promise<void>;
}

export const OWNER_KEY = "owner";

/** An in-memory store: tests, and the reference behaviour the backends match. */
export function memoryStoreFactory(): LocalStoreFactory & { dump(): Map<string, Map<string, LocalRow>> } {
  let tables = new Map<string, Map<string, LocalRow>>();
  let meta = new Map<string, string>();
  const t = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name)!;
  };
  return {
    dump: () => tables,
    async open(uid) {
      if (meta.get(OWNER_KEY) !== uid) {
        tables = new Map();
        meta = new Map([[OWNER_KEY, uid]]);
      }
      return {
        uid,
        async put(table, rows) {
          for (const r of rows) t(table).set(r.docId, { ...r, row: { ...r.row } });
        },
        async remove(table, ids) {
          for (const id of ids) t(table).delete(id);
        },
        async clear(table) {
          t(table).clear();
        },
        async all(table) {
          return [...t(table).values()].sort((a, b) => a.docId.localeCompare(b.docId));
        },
        async get(table, ids) {
          return ids.map((id) => t(table).get(id)).filter((r): r is LocalRow => !!r);
        },
        async count(table) {
          return t(table).size;
        },
        async evictOldest(table, keep) {
          const rows = [...t(table).values()].sort((a, b) => b.syncedAt.localeCompare(a.syncedAt) || b.docId.localeCompare(a.docId));
          const gone = rows.slice(keep);
          for (const r of gone) t(table).delete(r.docId);
          return gone.length;
        },
        async getMeta(key) {
          return meta.get(key) ?? null;
        },
        async setMeta(key, value) {
          if (value === null) meta.delete(key);
          else meta.set(key, value);
        },
        async close() {},
      };
    },
    async destroy() {
      tables = new Map();
      meta = new Map();
    },
  };
}
