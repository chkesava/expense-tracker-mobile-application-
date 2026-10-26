import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { mapDocument, READ_MODEL_TABLES, SPEC_BY_COLLECTION, timestampMillis, toJsonDoc } from "./mapping";

const migrationsDir = path.resolve(__dirname, "../../../supabase-readmodel/supabase/migrations");
const sql = readdirSync(migrationsDir)
  .sort()
  .map((f) => readFileSync(path.join(migrationsDir, f), "utf8"))
  .join("\n");

const CONTRACT = new Set([
  "uid", "doc_id", "doc", "source_path", "source_update_time", "source_deleted",
  "deleted_at", "schema_version", "mapping_status", "synced_at",
]);

function tableColumns(table: string): string[] {
  const body = new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(sql)?.[1] ?? "";
  return body
    .split("\n")
    .map((line) => /^\s+([a-z_]+)\s+[a-z]/.exec(line)?.[1])
    .filter((c): c is string => !!c && c !== "primary");
}

const UPDATE_TIME = { seconds: 1_790_000_000, nanoseconds: 0 };
const expenses = SPEC_BY_COLLECTION.get("expenses")!;

describe("read-model mapping (SPENDLY-506)", () => {
  it.each(READ_MODEL_TABLES.map((s) => [s.table, s] as const))("%s: spec covers exactly the typed columns", (table, spec) => {
    const typed = tableColumns(table).filter((c) => !CONTRACT.has(c));
    expect(typed.length).toBeGreaterThan(0);
    const mapped = [...spec.fields.map((f) => f.column), ...(spec.derivedMonth ? ["month"] : [])];
    expect([...mapped].sort()).toEqual([...typed].sort());
  });

  it("maps an expense: typed columns, month, contract columns and the full doc", () => {
    const row = mapDocument(expenses, "u1", {
      id: "e1",
      updateTime: UPDATE_TIME,
      data: {
        amount: 1200.5, date: "2026-09-30", month: "2026-10", category: "Food", subcategory: "Groceries",
        accountId: "bank", note: "kept in doc", createdAt: { toMillis: () => 1_790_000_000_000 },
      },
    });
    expect(row).toMatchObject({
      uid: "u1", doc_id: "e1", source_path: "users/u1/expenses/e1", mapping_status: "mapped",
      amount: 1200.5, date: "2026-09-30", month: "2026-10", category: "Food", account_id: "bank",
      credit_card_bill_id: null, soft_deleted_at: null, schema_version: 1,
    });
    expect(row.source_update_time).toBe(new Date(1_790_000_000_000).toISOString());
    expect(row.doc).toMatchObject({ note: "kept in doc", createdAt: new Date(1_790_000_000_000).toISOString() });
  });

  it("SPENDLY-609: maps a goal, including a legacy one with an empty deadline and no status", () => {
    const goals = SPEC_BY_COLLECTION.get("financialGoals")!;
    const v2 = mapDocument(goals, "u1", {
      id: "g1",
      updateTime: UPDATE_TIME,
      data: { name: "Car", status: "active", targetAmount: 1000, currentAmount: 250.5, deadline: "2027-01-01", createdAtMs: 1_790_000_000_000, pinned: true, nameKey: "n_car" },
    });
    expect(v2).toMatchObject({
      source_path: "users/u1/financialGoals/g1", mapping_status: "mapped", name: "Car", status: "active",
      target_amount: 1000, current_amount: 250.5, deadline: "2027-01-01", created_at: new Date(1_790_000_000_000).toISOString(), pinned: true,
    });
    expect(v2.doc).toMatchObject({ nameKey: "n_car" });
    const legacy = mapDocument(goals, "u1", { id: "g0", updateTime: UPDATE_TIME, data: { name: "Old", targetAmount: 10, currentAmount: 0, deadline: "" } });
    expect(legacy).toMatchObject({ mapping_status: "mapped", status: null, deadline: null, created_at: null, pinned: null });
  });

  it("SPENDLY-609: maps a goal event; a bad amount makes the row unmapped, never dropped", () => {
    const events = SPEC_BY_COLLECTION.get("goalEvents")!;
    const ok = mapDocument(events, "u1", {
      id: "ev1",
      updateTime: UPDATE_TIME,
      data: { goalId: "g1", type: "correction", amountDelta: -450, reason: "other", correctionOf: "c1", createdAtMs: 1_790_000_000_000, note: "typo" },
    });
    expect(ok).toMatchObject({ goal_id: "g1", type: "correction", amount_delta: -450, reason: "other", correction_of: "c1", mapping_status: "mapped" });
    expect(ok.doc).toMatchObject({ note: "typo" });
    const bad = mapDocument(events, "u1", { id: "ev2", updateTime: UPDATE_TIME, data: { goalId: "g1", type: "contribution", amountDelta: "lots" } });
    expect(bad).toMatchObject({ mapping_status: "unmapped", amount_delta: null, goal_id: null });
    expect(bad.doc).toMatchObject({ amountDelta: "lots" });
  });

  it("derives month from the date when the row has none", () => {
    const row = mapDocument(expenses, "u1", { id: "e", updateTime: UPDATE_TIME, data: { amount: 1, date: "2026-08-15" } });
    expect(row.month).toBe("2026-08");
  });

  it("treats a restored row's empty deletedAt as not deleted", () => {
    const row = mapDocument(expenses, "u1", { id: "e", updateTime: UPDATE_TIME, data: { amount: 1, deletedAt: "" } });
    expect(row.soft_deleted_at).toBeNull();
    expect(row.mapping_status).toBe("mapped");
  });

  it.each([
    ["non-numeric amount", { amount: "abc" }],
    ["NaN amount", { amount: Number.NaN }],
    ["overflowing amount", { amount: 1e17 }],
    ["impossible date", { amount: 1, date: "2026-02-30" }],
    ["slash date", { amount: 1, date: "2026/02/03" }],
    ["number as category", { amount: 1, category: 5 }],
    ["garbage deletedAt", { amount: 1, deletedAt: "not a time" }],
  ])("marks a row unmapped, never dropped: %s", (_name, data) => {
    const row = mapDocument(expenses, "u1", { id: "bad", updateTime: UPDATE_TIME, data });
    expect(row.mapping_status).toBe("unmapped");
    expect(row.amount).toBeNull();
    expect(row.month).toBeNull();
    expect(row.doc).toEqual(toJsonDoc(data));
    expect(row.doc_id).toBe("bad");
  });

  it("accepts numeric strings and ISO datetimes", () => {
    const row = mapDocument(expenses, "u1", { id: "e", updateTime: UPDATE_TIME, data: { amount: "99.5", date: "2026-10-01T05:30:00.000Z" } });
    expect(row).toMatchObject({ amount: 99.5, date: "2026-10-01", mapping_status: "mapped" });
  });

  it("normalises every timestamp shape", () => {
    const ms = Date.UTC(2026, 9, 1, 12);
    expect(timestampMillis({ toMillis: () => ms })).toBe(ms);
    expect(timestampMillis({ seconds: ms / 1000, nanoseconds: 0 })).toBe(ms);
    expect(timestampMillis({ _seconds: ms / 1000, _nanoseconds: 0 })).toBe(ms);
    expect(timestampMillis(new Date(ms).toISOString())).toBe(ms);
    expect(timestampMillis(ms)).toBe(ms);
    expect(timestampMillis(new Date(ms))).toBe(ms);
    expect(timestampMillis("nope")).toBeNull();
  });

  it("maps booleans and integers strictly", () => {
    const categories = SPEC_BY_COLLECTION.get("categories")!;
    expect(mapDocument(categories, "u", { id: "c", updateTime: UPDATE_TIME, data: { name: "A", isHidden: true, sortOrder: 3 } }))
      .toMatchObject({ is_hidden: true, sort_order: 3, mapping_status: "mapped" });
    expect(mapDocument(categories, "u", { id: "c", updateTime: UPDATE_TIME, data: { name: "A", sortOrder: 1.5 } }).mapping_status)
      .toBe("unmapped");
    expect(mapDocument(categories, "u", { id: "c", updateTime: UPDATE_TIME, data: { name: "A", isHidden: "yes" } }).mapping_status)
      .toBe("unmapped");
  });

  it("refuses a document with no updateTime (the version guard needs one)", () => {
    expect(() => mapDocument(expenses, "u", { id: "e", updateTime: undefined, data: {} })).toThrow(/updateTime/);
  });

  it("produces JSON-safe docs", () => {
    expect(toJsonDoc({ a: Number.POSITIVE_INFINITY, b: [1, { c: new Date(0) }], d: undefined })).toEqual({
      a: null, b: [1, { c: "1970-01-01T00:00:00.000Z" }], d: null,
    });
  });
});
