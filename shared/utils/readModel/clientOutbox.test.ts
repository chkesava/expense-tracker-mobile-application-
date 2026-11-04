import { describe, expect, it } from "vitest";

import {
  MAX_BATCH,
  MAX_QUEUE,
  backoffMs,
  buildClientEntry,
  emptyQueue,
  enqueue,
  isRefusal,
  nextBatch,
  parseQueue,
  queueStats,
  settle,
  type ClientWriteEntry,
} from "./clientOutbox";

const at = (s: number) => new Date(Date.UTC(2026, 10, 3, 10, 0, s)).toISOString();
const expense = (id: string, s: number, amount = 10) =>
  buildClientEntry({ uid: "u1", collection: "expenses", docId: id, doc: { id, data: { amount, date: "2026-11-03", category: "Food" } }, at: at(s) })!;

describe("buildClientEntry (SPENDLY-670)", () => {
  it("maps a cached document with the shared mapper and stamps client_written_at", () => {
    const e = expense("e1", 1, 42);
    expect(e).toMatchObject({ key: "expenses/e1", table: "expenses", uid: "u1", docId: "e1", at: at(1), attempts: 0 });
    expect(e.row).toMatchObject({ uid: "u1", doc_id: "e1", amount: 42, category: "Food", client_written_at: at(1) });
    expect(e.row?.source_path).toBe("users/u1/expenses/e1");
  });

  it("is a delete when the document is gone, and null for a collection that isn't synced", () => {
    expect(buildClientEntry({ uid: "u1", collection: "expenses", docId: "e1", doc: null, at: at(1) })).toMatchObject({ key: "expenses/e1" });
    expect(buildClientEntry({ uid: "u1", collection: "expenses", docId: "e1", doc: null, at: at(1) })?.row).toBeUndefined();
    expect(buildClientEntry({ uid: "u1", collection: "watchlist", docId: "x", doc: null, at: at(1) })).toBeNull();
    // SPENDLY-592: a stored summary dual-writes; a retired one never does.
    expect(buildClientEntry({ uid: "u1", collection: "financialSummaries", docId: "dashboard_2026-10", doc: { id: "dashboard_2026-10", data: { totalExpenses: 10 } }, at: at(1) })?.row).toMatchObject({ total_expenses: 10 });
    expect(buildClientEntry({ uid: "u1", collection: "financialSummaries", docId: "netWorth", doc: { id: "netWorth", data: {} }, at: at(1) })).toBeNull();
    // SPENDLY-591: the users/{uid} copy is server-push only, never rm_client_apply.
    expect(buildClientEntry({ uid: "u1", collection: "userSettings", docId: "settings", doc: { id: "u1", data: { currency: "INR" } }, at: at(1) })).toBeNull();
    // A nested write keys on its composite id and keeps the real path.
    const item = buildClientEntry({ uid: "u1", collection: "watchlists/items", docId: "default/INFY.NS", doc: { id: "INFY.NS", data: { symbol: "INFY" } }, at: at(1) });
    expect(item).toMatchObject({ key: "watchlist_items/default/INFY.NS", row: { list_id: "default", source_path: "users/u1/watchlists/default/items/INFY.NS" } });
  });
});

describe("enqueue", () => {
  it("keeps one entry per document: the newest save", () => {
    let q = enqueue(emptyQueue("u1"), [expense("e1", 1, 10), expense("e2", 2)]);
    q = enqueue(q, [expense("e1", 3, 30)]);
    q = enqueue(q, [expense("e1", 2, 20)]); // an older save arriving late
    expect(q.entries.map((e) => [e.key, e.row?.amount])).toEqual([["expenses/e2", 10], ["expenses/e1", 30]]);
  });

  it("ignores entries for another user", () => {
    const other = { ...expense("e1", 1), uid: "u2" };
    expect(enqueue(emptyQueue("u1"), [other]).entries).toEqual([]);
  });

  it("drops the oldest entries beyond MAX_QUEUE and counts them", () => {
    const many: ClientWriteEntry[] = Array.from({ length: MAX_QUEUE + 3 }, (_, i) => ({
      ...expense(`e${i}`, 0),
      at: new Date(Date.UTC(2026, 10, 3) + i * 1000).toISOString(),
    }));
    const q = enqueue(emptyQueue("u1"), many);
    expect(q.entries).toHaveLength(MAX_QUEUE);
    expect(q.dropped).toBe(3);
    expect(q.entries[0].docId).toBe("e3");
  });
});

describe("nextBatch / settle", () => {
  it("sends the oldest entry's table, oldest first, rows and deletes together", () => {
    const del = buildClientEntry({ uid: "u1", collection: "expenses", docId: "gone", doc: null, at: at(4) })!;
    const income = buildClientEntry({ uid: "u1", collection: "incomes", docId: "i1", doc: { id: "i1", data: { amount: 5 } }, at: at(2) })!;
    const q = enqueue(emptyQueue("u1"), [expense("e1", 1), income, expense("e2", 3), del]);
    const b = nextBatch(q)!;
    expect(b.table).toBe("expenses");
    expect(b.rows.map((r) => r.doc_id)).toEqual(["e1", "e2"]);
    expect(b.deletes).toEqual([{ uid: "u1", doc_id: "gone", client_written_at: at(4) }]);

    const after = settle(q, b, "ok");
    expect(after.entries.map((e) => e.key)).toEqual(["incomes/i1"]);
    expect(nextBatch(after)!.table).toBe("incomes");
  });

  it("caps a batch at MAX_BATCH rows", () => {
    const q = enqueue(emptyQueue("u1"), Array.from({ length: MAX_BATCH + 5 }, (_, i) => expense(`e${i}`, i % 59)));
    expect(nextBatch(q)!.rows).toHaveLength(MAX_BATCH);
  });

  it("keeps a newer save of a sent document when the batch settles", () => {
    let q = enqueue(emptyQueue("u1"), [expense("e1", 1, 10)]);
    const b = nextBatch(q)!;
    q = enqueue(q, [expense("e1", 5, 50)]); // saved again while the batch was in flight
    q = settle(q, b, "ok");
    expect(q.entries.map((e) => e.row?.amount)).toEqual([50]);
  });

  it("retry keeps the entries and counts the attempt; refused drops them", () => {
    const q = enqueue(emptyQueue("u1"), [expense("e1", 1)]);
    const b = nextBatch(q)!;
    expect(settle(q, b, "retry").entries[0].attempts).toBe(1);
    expect(settle(q, b, "refused").entries).toEqual([]);
  });

  it("is empty for an empty queue", () => {
    expect(nextBatch(emptyQueue("u1"))).toBeNull();
  });
});

describe("isRefusal / backoffMs", () => {
  it("treats data, constraint and privilege errors as refusals, and everything else as retryable", () => {
    for (const code of ["42501", "22023", "22P02", "23514"]) expect(isRefusal({ code })).toBe(true);
    for (const code of ["PGRST301", "57014", "08006", ""]) expect(isRefusal({ code })).toBe(false);
    expect(isRefusal(null)).toBe(false);
    expect(isRefusal({})).toBe(false);
  });

  it("backs off from 2 s, doubling, capped at 5 minutes", () => {
    expect([1, 2, 3, 4].map(backoffMs)).toEqual([2000, 4000, 8000, 16000]);
    expect(backoffMs(20)).toBe(5 * 60_000);
    expect(backoffMs(0)).toBe(2000);
  });
});

describe("parseQueue / queueStats", () => {
  it("restores a persisted queue for the same user only, skipping malformed entries", () => {
    const q = enqueue(emptyQueue("u1"), [expense("e1", 1)]);
    const raw = JSON.parse(JSON.stringify({ ...q, entries: [...q.entries, { key: 1 }, { ...q.entries[0], uid: "u2", key: "expenses/x" }] }));
    expect(parseQueue(raw, "u1").entries.map((e) => e.key)).toEqual(["expenses/e1"]);
    expect(parseQueue(raw, "u2").entries).toEqual([]);
    expect(parseQueue("garbage", "u1")).toEqual(emptyQueue("u1"));
  });

  it("reports the backlog and its oldest age", () => {
    const q = enqueue(emptyQueue("u1"), [expense("e1", 1), expense("e2", 3)]);
    expect(queueStats(q, Date.parse(at(11)))).toEqual({ pending: 2, oldestAgeMs: 10_000, dropped: 0 });
    expect(queueStats(emptyQueue("u1"), 0)).toEqual({ pending: 0, oldestAgeMs: null, dropped: 0 });
  });
});
