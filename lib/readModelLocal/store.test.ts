import "fake-indexeddb/auto";

import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { SPEC_BY_COLLECTION, type TableSpec } from "@/shared/utils/readModel/mapping";

import { idbStoreFactory } from "./idbStore";
import { localColumns, sqliteStoreFactory, type SqlDb, type SqlValue } from "./sqliteStore";
import { memoryStoreFactory, type LocalStoreFactory } from "./store";

/** expo-sqlite's async API over node:sqlite, as far as the backend uses it. */
function nodeSqlite(): { openDb(): Promise<SqlDb>; deleteDb(): Promise<void>; deleted(): number } {
  let db: DatabaseSync | null = null;
  let deleted = 0;
  return {
    deleted: () => deleted,
    async openDb() {
      db ??= new DatabaseSync(":memory:");
      const d = db;
      return {
        async execAsync(sql) {
          d.exec(sql);
        },
        async runAsync(sql, ...params: SqlValue[]) {
          const r = d.prepare(sql).run(...params);
          return { changes: Number(r.changes) };
        },
        async getAllAsync<T>(sql: string, ...params: SqlValue[]) {
          return d.prepare(sql).all(...params) as T[];
        },
        async withTransactionAsync(task) {
          d.exec("begin");
          try {
            await task();
            d.exec("commit");
          } catch (error) {
            d.exec("rollback");
            throw error;
          }
        },
        async closeAsync() {},
      };
    },
    async deleteDb() {
      db?.close();
      db = null;
      deleted += 1;
    },
  };
}

const expenses = SPEC_BY_COLLECTION.get("expenses")!;
const accounts = SPEC_BY_COLLECTION.get("accounts")!;
const tables: TableSpec[] = [expenses, accounts];
const row = (id: string, syncedAt: string, amount: number) => ({
  docId: id,
  syncedAt,
  row: { uid: "u1", doc_id: id, amount, date: "2026-11-04", category: "Food", doc: { amount, note: "x" }, synced_at: syncedAt },
});

const backends: [string, () => LocalStoreFactory][] = [
  ["memory", () => memoryStoreFactory()],
  ["sqlite", () => sqliteStoreFactory({ ...nodeSqlite(), tables })],
  ["indexeddb", () => idbStoreFactory({ indexedDB: new IDBFactory(), tables })],
];

describe.each(backends)("local store: %s (SPENDLY-594)", (_name, make) => {
  it("puts, replaces, gets, lists, counts and removes rows, keeping the whole row", async () => {
    const store = await make().open("u1");
    await store.put("expenses", [row("e1", "2026-11-04T10:00:00Z", 100), row("e2", "2026-11-04T10:01:00Z", 250)]);
    await store.put("expenses", [row("e1", "2026-11-04T10:02:00Z", 120)]);
    expect(await store.count("expenses")).toBe(2);
    expect(await store.get("expenses", ["e1", "nope"])).toEqual([row("e1", "2026-11-04T10:02:00Z", 120)]);
    expect((await store.all("expenses")).map((r) => r.docId).sort()).toEqual(["e1", "e2"]);
    await store.remove("expenses", ["e2"]);
    expect(await store.count("expenses")).toBe(1);
    expect(await store.count("accounts")).toBe(0);
    await store.clear("expenses");
    expect(await store.all("expenses")).toEqual([]);
  });

  it("evicts the oldest by synced_at past a cap", async () => {
    const store = await make().open("u1");
    await store.put("expenses", [row("a", "2026-11-01T00:00:00Z", 1), row("b", "2026-11-03T00:00:00Z", 2), row("c", "2026-11-02T00:00:00Z", 3)]);
    expect(await store.evictOldest("expenses", 2)).toBe(1);
    expect((await store.all("expenses")).map((r) => r.docId).sort()).toEqual(["b", "c"]);
  });

  it("keeps meta; another uid opening the store wipes everything first", async () => {
    const factory = make();
    const a = await factory.open("u1");
    await a.put("expenses", [row("e1", "2026-11-04T10:00:00Z", 100)]);
    await a.setMeta("table:expenses:hydrated", "1");
    expect(await a.getMeta("table:expenses:hydrated")).toBe("1");
    await a.close();
    const again = await factory.open("u1");
    expect(await again.count("expenses")).toBe(1);
    await again.close();
    const b = await factory.open("u2");
    expect(await b.count("expenses")).toBe(0);
    expect(await b.getMeta("table:expenses:hydrated")).toBeNull();
  });

  it("destroy removes everything", async () => {
    const factory = make();
    const a = await factory.open("u1");
    await a.put("expenses", [row("e1", "2026-11-04T10:00:00Z", 100)]);
    await factory.destroy();
    const b = await factory.open("u1");
    expect(await b.count("expenses")).toBe(0);
  });
});

describe("local store schema (SPENDLY-594)", () => {
  it("SQLite tables carry the spec's typed columns, so screens can filter and sort in SQL", async () => {
    const sqlite = nodeSqlite();
    const store = await sqliteStoreFactory({ ...sqlite, tables }).open("u1");
    await store.put("expenses", [row("e1", "2026-11-04T10:00:00Z", 100)]);
    const db = await sqlite.openDb();
    const cols = (await db.getAllAsync<{ name: string }>("select name from pragma_table_info('rm_expenses')")).map((c) => c.name);
    expect(cols).toEqual(["doc_id", "synced_at", "row", ...localColumns(expenses).map((c) => c.name)]);
    expect(await db.getAllAsync("select amount, category, month from rm_expenses")).toEqual([{ amount: 100, category: "Food", month: null }]);
  });

  it("a mapping change drops that table and its hydration meta, so it hydrates again", async () => {
    const sqlite = nodeSqlite();
    const first = await sqliteStoreFactory({ ...sqlite, tables }).open("u1");
    await first.put("expenses", [row("e1", "2026-11-04T10:00:00Z", 100)]);
    await first.put("accounts", [{ docId: "a1", syncedAt: "2026-11-04T10:00:00Z", row: { name: "Bank" } }]);
    await first.setMeta("table:expenses:hydrated", "1");
    await first.setMeta("table:accounts:hydrated", "1");
    const changed: TableSpec = { ...expenses, fields: [...expenses.fields, { column: "new_col", source: "newCol", type: "text" }] };
    const second = await sqliteStoreFactory({ ...sqlite, tables: [changed, accounts] }).open("u1");
    expect(await second.count("expenses")).toBe(0);
    expect(await second.getMeta("table:expenses:hydrated")).toBeNull();
    expect(await second.count("accounts")).toBe(1);
    expect(await second.getMeta("table:accounts:hydrated")).toBe("1");
  });

  it("an unknown table is refused (SQLite and IndexedDB)", async () => {
    await expect(sqliteStoreFactory({ ...nodeSqlite(), tables }).open("u1").then((s) => s.count("nope"))).rejects.toThrow(/unknown table/);
    await expect(idbStoreFactory({ indexedDB: new IDBFactory(), tables }).open("u1").then((s) => s.count("nope"))).rejects.toThrow(/unknown table/);
  });
});
