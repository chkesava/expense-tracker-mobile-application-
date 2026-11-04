import { READ_MODEL_TABLES, type TableSpec } from "@/shared/utils/readModel/mapping";

import { OWNER_KEY, type LocalRow, type LocalRowStore, type LocalStoreFactory } from "./store";

/**
 * SPENDLY-594 — the native backend: one SQLite table per synced table.
 *
 * Columns: `doc_id` (key), `synced_at`, the full row as JSON (`row`: what screens
 * display, money included, exactly as PostgREST returned it), and the spec's typed
 * columns for filtering, sorting and indexes (SPENDLY-673). A table whose
 * columns changed (a mapping change) is dropped and recreated, and its
 * per-table meta (`table:<name>:*`, the hydration cursor) goes with it, so the
 * copy hydrates it again.
 *
 * Written against the subset of expo-sqlite's async API it needs, so tests run
 * it on node:sqlite.
 */
export type SqlValue = string | number | null;
export interface SqlDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: SqlValue[]): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
}

const SQL_TYPE: Record<string, string> = {
  text: "TEXT", date: "TEXT", timestamp: "TEXT", money: "REAL", decimal: "REAL", integer: "INTEGER", boolean: "INTEGER",
};

/** The typed columns a spec's local table carries (the parent id and derived month included). */
export function localColumns(spec: TableSpec): { name: string; type: string }[] {
  return [
    ...(spec.parent ? [{ name: spec.parent.column, type: "TEXT" }] : []),
    ...spec.fields.map((f) => ({ name: f.column, type: SQL_TYPE[f.type] ?? "TEXT" })),
    ...(spec.derivedMonth ? [{ name: "month", type: "TEXT" }] : []),
  ];
}

const tableName = (table: string) => `rm_${table}`;
const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

function createSql(spec: TableSpec): string {
  const cols = localColumns(spec).map((c) => `${q(c.name)} ${c.type}`);
  return `create table if not exists ${q(tableName(spec.table))} (doc_id TEXT PRIMARY KEY NOT NULL, synced_at TEXT NOT NULL, row TEXT NOT NULL${
    cols.length ? ", " + cols.join(", ") : ""
  })`;
}

function toSql(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

const CHUNK = 400;

export function sqliteStoreFactory(deps: { openDb(): Promise<SqlDb>; deleteDb(): Promise<void>; tables?: TableSpec[] }): LocalStoreFactory {
  const specs = new Map((deps.tables ?? READ_MODEL_TABLES).map((s) => [s.table, s]));
  let current: SqlDb | null = null;

  async function closeCurrent() {
    if (!current) return;
    const db = current;
    current = null;
    await db.closeAsync().catch(() => undefined);
  }

  return {
    async open(uid) {
      await closeCurrent();
      const db = await deps.openDb();
      current = db;
      await db.execAsync("create table if not exists rm_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)");
      const owner = (await db.getAllAsync<{ value: string }>("select value from rm_meta where key = ?", OWNER_KEY))[0]?.value;
      if (owner !== uid) {
        // Another user's copy (or none): nothing of it may survive.
        const existing = await db.getAllAsync<{ name: string }>("select name from sqlite_master where type = 'table' and name like 'rm\\_%' escape '\\' and name <> 'rm_meta'");
        await db.withTransactionAsync(async () => {
          for (const { name } of existing) await db.execAsync(`drop table if exists ${q(name)}`);
          await db.runAsync("delete from rm_meta");
          await db.runAsync("insert into rm_meta (key, value) values (?, ?)", OWNER_KEY, uid);
        });
      }
      for (const spec of specs.values()) {
        const hash = JSON.stringify(localColumns(spec));
        const key = `schema:${spec.table}`;
        const stored = (await db.getAllAsync<{ value: string }>("select value from rm_meta where key = ?", key))[0]?.value;
        if (stored === hash) continue;
        await db.withTransactionAsync(async () => {
          await db.execAsync(`drop table if exists ${q(tableName(spec.table))}`);
          await db.execAsync(createSql(spec));
          await db.execAsync(`create index if not exists ${q(`${tableName(spec.table)}_synced`)} on ${q(tableName(spec.table))} (synced_at)`);
          await db.runAsync("delete from rm_meta where key like ?", `table:${spec.table}:%`);
          await db.runAsync("insert or replace into rm_meta (key, value) values (?, ?)", key, hash);
        });
      }

      const spec = (table: string) => {
        const s = specs.get(table);
        if (!s) throw new Error(`local copy: unknown table ${table}`);
        return s;
      };
      const live = () => {
        if (current !== db) throw new Error("local copy: store is closed");
        return db;
      };

      const store: LocalRowStore = {
        uid,
        async put(table, rows) {
          if (!rows.length) return;
          const cols = localColumns(spec(table));
          const names = ["doc_id", "synced_at", "row", ...cols.map((c) => c.name)];
          const sql = `insert or replace into ${q(tableName(table))} (${names.map(q).join(", ")}) values (${names.map(() => "?").join(", ")})`;
          const d = live();
          await d.withTransactionAsync(async () => {
            for (const r of rows) {
              await d.runAsync(sql, r.docId, r.syncedAt, JSON.stringify(r.row), ...cols.map((c) => toSql(r.row[c.name])));
            }
          });
        },
        async remove(table, ids) {
          spec(table);
          const d = live();
          for (let i = 0; i < ids.length; i += CHUNK) {
            const part = ids.slice(i, i + CHUNK);
            await d.runAsync(`delete from ${q(tableName(table))} where doc_id in (${part.map(() => "?").join(", ")})`, ...part);
          }
        },
        async clear(table) {
          spec(table);
          await live().runAsync(`delete from ${q(tableName(table))}`);
        },
        async all(table) {
          spec(table);
          const rows = await live().getAllAsync<{ doc_id: string; synced_at: string; row: string }>(
            `select doc_id, synced_at, row from ${q(tableName(table))} order by doc_id`
          );
          return rows.map((r) => ({ docId: r.doc_id, syncedAt: r.synced_at, row: JSON.parse(r.row) as Record<string, unknown> }));
        },
        async get(table, ids) {
          spec(table);
          const out: LocalRow[] = [];
          for (let i = 0; i < ids.length; i += CHUNK) {
            const part = ids.slice(i, i + CHUNK);
            const rows = await live().getAllAsync<{ doc_id: string; synced_at: string; row: string }>(
              `select doc_id, synced_at, row from ${q(tableName(table))} where doc_id in (${part.map(() => "?").join(", ")})`,
              ...part
            );
            out.push(...rows.map((r) => ({ docId: r.doc_id, syncedAt: r.synced_at, row: JSON.parse(r.row) as Record<string, unknown> })));
          }
          return out;
        },
        async count(table) {
          spec(table);
          return (await live().getAllAsync<{ n: number }>(`select count(*) as n from ${q(tableName(table))}`))[0]?.n ?? 0;
        },
        async evictOldest(table, keep) {
          spec(table);
          const t = q(tableName(table));
          const { changes } = await live().runAsync(
            `delete from ${t} where doc_id not in (select doc_id from ${t} order by synced_at desc, doc_id desc limit ?)`,
            keep
          );
          return changes;
        },
        async getMeta(key) {
          return (await live().getAllAsync<{ value: string }>("select value from rm_meta where key = ?", key))[0]?.value ?? null;
        },
        async setMeta(key, value) {
          if (value === null) await live().runAsync("delete from rm_meta where key = ?", key);
          else await live().runAsync("insert or replace into rm_meta (key, value) values (?, ?)", key, value);
        },
        async close() {
          if (current === db) await closeCurrent();
        },
      };
      return store;
    },
    async destroy() {
      await closeCurrent();
      await deps.deleteDb().catch(() => undefined);
    },
  };
}
