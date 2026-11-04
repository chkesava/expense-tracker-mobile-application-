import { READ_MODEL_TABLES, type TableSpec } from "@/shared/utils/readModel/mapping";

import { localColumns } from "./sqliteStore";
import { OWNER_KEY, type LocalRow, type LocalRowStore, type LocalStoreFactory } from "./store";

/**
 * SPENDLY-594 — the web backend: IndexedDB behind the same interface.
 *
 * One object store of rows keyed `[table, docId]` (index `by_table_synced` on
 * `[table, syncedAt]`) and one of meta. Same rules as SQLite: one owner uid
 * (another uid wipes it first), and a table whose mapping changed is cleared
 * with its `table:<name>:*` meta so the copy hydrates it again.
 */
export const IDB_NAME = "spendly-readmodel";
const ROWS = "rows";
const META = "meta";

type Stored = { t: string; id: string; s: string; row: Record<string, unknown> };

const done = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
  });

export function idbStoreFactory(deps: { indexedDB: IDBFactory; tables?: TableSpec[] }): LocalStoreFactory {
  const specs = new Map((deps.tables ?? READ_MODEL_TABLES).map((s) => [s.table, s]));
  let current: IDBDatabase | null = null;

  function openDb(): Promise<IDBDatabase> {
    const req = deps.indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      const rows = db.createObjectStore(ROWS, { keyPath: ["t", "id"] });
      rows.createIndex("by_table_synced", ["t", "s"]);
      db.createObjectStore(META, { keyPath: "k" });
    };
    return done(req);
  }

  async function clearTable(db: IDBDatabase, table: string) {
    const tx = db.transaction([ROWS, META], "readwrite");
    const range = IDBKeyRange.bound([table, ""], [table, "￿"]);
    tx.objectStore(ROWS).delete(range);
    const meta = tx.objectStore(META);
    const keys = await done(meta.getAllKeys(IDBKeyRange.bound(`table:${table}:`, `table:${table}:￿`)));
    for (const k of keys) meta.delete(k);
    await finished(tx);
  }

  return {
    async open(uid) {
      current?.close();
      const db = await openDb();
      current = db;
      const metaGet = async (k: string) =>
        ((await done(db.transaction(META).objectStore(META).get(k))) as { v: string } | undefined)?.v ?? null;
      if ((await metaGet(OWNER_KEY)) !== uid) {
        const tx = db.transaction([ROWS, META], "readwrite");
        tx.objectStore(ROWS).clear();
        tx.objectStore(META).clear();
        tx.objectStore(META).put({ k: OWNER_KEY, v: uid });
        await finished(tx);
      }
      for (const spec of specs.values()) {
        const hash = JSON.stringify(localColumns(spec));
        if ((await metaGet(`schema:${spec.table}`)) === hash) continue;
        await clearTable(db, spec.table);
        const tx = db.transaction(META, "readwrite");
        tx.objectStore(META).put({ k: `schema:${spec.table}`, v: hash });
        await finished(tx);
      }

      const check = (table: string) => {
        if (!specs.has(table)) throw new Error(`local copy: unknown table ${table}`);
        if (current !== db) throw new Error("local copy: store is closed");
      };
      const rowsOf = async (table: string): Promise<Stored[]> =>
        (await done(db.transaction(ROWS).objectStore(ROWS).getAll(IDBKeyRange.bound([table, ""], [table, "￿"])))) as Stored[];
      const toLocal = (s: Stored): LocalRow => ({ docId: s.id, syncedAt: s.s, row: s.row });

      const store: LocalRowStore = {
        uid,
        async put(table, rows) {
          check(table);
          if (!rows.length) return;
          const tx = db.transaction(ROWS, "readwrite");
          for (const r of rows) tx.objectStore(ROWS).put({ t: table, id: r.docId, s: r.syncedAt, row: r.row } satisfies Stored);
          await finished(tx);
        },
        async remove(table, ids) {
          check(table);
          const tx = db.transaction(ROWS, "readwrite");
          for (const id of ids) tx.objectStore(ROWS).delete([table, id]);
          await finished(tx);
        },
        async clear(table) {
          check(table);
          const tx = db.transaction(ROWS, "readwrite");
          tx.objectStore(ROWS).delete(IDBKeyRange.bound([table, ""], [table, "￿"]));
          await finished(tx);
        },
        async all(table) {
          check(table);
          return (await rowsOf(table)).map(toLocal);
        },
        async get(table, ids) {
          check(table);
          const out: LocalRow[] = [];
          for (const id of ids) {
            const s = (await done(db.transaction(ROWS).objectStore(ROWS).get([table, id]))) as Stored | undefined;
            if (s) out.push(toLocal(s));
          }
          return out;
        },
        async count(table) {
          check(table);
          return done(db.transaction(ROWS).objectStore(ROWS).count(IDBKeyRange.bound([table, ""], [table, "￿"])));
        },
        async evictOldest(table, keep) {
          check(table);
          const rows = (await rowsOf(table)).sort((a, b) => b.s.localeCompare(a.s) || b.id.localeCompare(a.id));
          const gone = rows.slice(keep);
          if (!gone.length) return 0;
          const tx = db.transaction(ROWS, "readwrite");
          for (const g of gone) tx.objectStore(ROWS).delete([table, g.id]);
          await finished(tx);
          return gone.length;
        },
        async getMeta(key) {
          if (current !== db) throw new Error("local copy: store is closed");
          return metaGet(key);
        },
        async setMeta(key, value) {
          if (current !== db) throw new Error("local copy: store is closed");
          const tx = db.transaction(META, "readwrite");
          if (value === null) tx.objectStore(META).delete(key);
          else tx.objectStore(META).put({ k: key, v: value });
          await finished(tx);
        },
        async close() {
          if (current === db) {
            db.close();
            current = null;
          }
        },
      };
      return store;
    },
    async destroy() {
      current?.close();
      current = null;
      await new Promise<void>((resolve) => {
        const req = deps.indexedDB.deleteDatabase(IDB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    },
  };
}
