import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SPENDLY-512 — the read-model backends: the loopback used by Spendly Test,
 * and the Supabase filter query. The loopback must follow the same row rules
 * as the SQL (live rows only, date keyset order, the same filters).
 */
let emulatorDocs: { id: string; data: () => Record<string, unknown> }[] = [];
const reads: string[] = [];
vi.mock("firebase/firestore", () => ({
  Timestamp: { fromMillis: (ms: number) => ({ __ts: ms }) },
  collection: (...args: unknown[]) => ({ path: args.slice(1).join("/") }),
  getDocs: async (ref: { path: string }) => {
    reads.push(ref.path);
    return { docs: emulatorDocs };
  },
}));
vi.mock("@/lib/firestoreReadDebug", () => ({ logDirectRead: vi.fn() }));
vi.mock("@/lib/errors", () => ({ logWarning: vi.fn() }));
vi.mock("@/lib/readModelClient", () => ({ connectReadModel: vi.fn() }));

import { loopbackBackend, supabaseBackend } from "./backend";
import { readJournalMatches, setJournalReadPathForTests } from "./journalReadPath";
import { createReadPath } from "./readPath";

const d = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });
const user = { uid: "u1", getIdToken: async () => "t", getIdTokenResult: async () => ({ claims: {} }) };

beforeEach(() => {
  reads.length = 0;
  setJournalReadPathForTests(createReadPath({ timeoutMs: 500, log: () => {} }));
  emulatorDocs = [
    d("a", { amount: 100, date: "2026-03-05", category: "Food", accountId: "hdfc", createdAt: { toMillis: () => 1000 } }),
    d("b", { amount: 250, date: "2026-03-05", category: "Fuel", accountId: "sbi" }),
    d("c", { amount: 40, date: "2026-02-10", category: "Food", accountId: "hdfc" }),
    d("gone", { amount: 999, date: "2026-03-06", category: "Food", deletedAt: "2026-03-07T00:00:00Z" }),
    d("restored", { amount: 7, date: "2026-01-02", category: "Food", deletedAt: "" }),
    d("undated", { amount: 1, category: "Food" }),
  ];
});

describe("loopback read model for Spendly Test (SPENDLY-512)", () => {
  it("serves a month like the SQL: live rows of that month, as app objects", async () => {
    const rows = await loopbackBackend({} as never, "u1").month<{ id: string }>("expenses", "2026-03");
    expect(rows.map((r) => r.id).sort()).toEqual(["a", "b"]);
    expect(reads).toEqual(["users/u1/expenses"]);
    // Round-tripped like the real sync: createdAt comes back a Timestamp.
    expect(rows.find((r) => r.id === "a")).toMatchObject({ amount: 100, createdAt: { __ts: 1000 } });
  });

  it("pages by date desc then id desc, then undated rows, then completes", async () => {
    const lb = loopbackBackend({} as never, "u1");
    const p1 = await lb.page<{ id: string }>("expenses", null, 2);
    expect(p1.items.map((r) => r.id)).toEqual(["b", "a"]);
    expect(p1.next).toEqual({ date: "2026-03-05", docId: "a" });
    const p2 = await lb.page<{ id: string }>("expenses", p1.next, 2);
    expect(p2.items.map((r) => r.id)).toEqual(["c", "restored"]);
    const p3 = await lb.page<{ id: string }>("expenses", p2.next, 2);
    expect(p3).toMatchObject({ next: "undated", exhausted: false, items: [] });
    const p4 = await lb.page<{ id: string }>("expenses", "undated", 2);
    expect(p4).toMatchObject({ exhausted: true });
    expect(p4.items.map((r) => r.id)).toEqual(["undated"]);
  });

  it("matches filters like the SQL, never returning soft-deleted rows", async () => {
    const lb = loopbackBackend({} as never, "u1");
    const ids = async (m: Parameters<typeof lb.matching>[1]) => (await lb.matching<{ id: string }>("expenses", m)).map((r) => r.id).sort();
    expect(await ids({ categories: ["Food"] })).toEqual(["a", "c", "restored", "undated"]);
    expect(await ids({ accountIds: ["hdfc"], minAmount: 50 })).toEqual(["a"]);
    expect(await ids({ categories: ["Food"], fromDate: "2026-02-01", toDate: "2026-02-28" })).toEqual(["c"]);
    expect(await ids({ maxAmount: 40 })).toEqual(["c", "restored", "undated"]);
  });

  it("can simulate an outage and sync lag for device testing", async () => {
    await expect(loopbackBackend({} as never, "u1", { fail: true }).month("expenses", "2026-03")).rejects.toThrow(/simulated outage/);
    expect(await loopbackBackend({} as never, "u1", { lagMinutes: 240 }, () => 1_000_000_000).lastSyncedAt(["expenses"])).toBe(1_000_000_000 - 240 * 60_000);
  });
});

describe("Journal filter matches through the read path (SPENDLY-512)", () => {
  const base = { db: {} as never, user, collectionName: "expenses" as const, locallyRemovedIds: new Set(["c"]), match: { categories: ["Food"] } };

  it("firestore mode (default) and shadow do nothing: the Journal behaves as before", async () => {
    const connect = vi.fn();
    expect(await readJournalMatches({ ...base, conditions: { setting: undefined, online: true, duress: false }, connect })).toBeNull();
    expect(await readJournalMatches({ ...base, conditions: { setting: { journal: "shadow" }, online: true, duress: false, localTestMode: true }, connect })).toBeNull();
    expect(connect).not.toHaveBeenCalled();
    expect(reads).toEqual([]);
  });

  it("a local test build uses the loopback, never connects to Supabase, and drops locally removed rows", async () => {
    const connect = vi.fn();
    const rows = await readJournalMatches<{ id: string }>({
      ...base, conditions: { setting: { journal: "supabase" }, online: true, duress: false, localTestMode: true }, connect,
    });
    expect(connect).not.toHaveBeenCalled();
    expect(rows?.map((r) => r.id).sort()).toEqual(["a", "restored", "undated"]);
  });

  it("a failure returns null (the screen filters what it has; paging continues)", async () => {
    const rows = await readJournalMatches({
      ...base, conditions: { setting: { journal: "supabase", loopbackFail: true }, online: true, duress: false, localTestMode: true },
    });
    expect(rows).toBeNull();
  });

  it("supabase builds the SQL filter with a paisa margin on amounts", async () => {
    const log: unknown[][] = [];
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "in", "gte", "lte", "order", "range"]) {
      builder[m] = (...args: unknown[]) => (log.push([m, ...args]), builder);
    }
    builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: [{ doc_id: "x", doc: { amount: 120 } }], error: null });
    const rows = await supabaseBackend({ from: () => builder } as never).matching<{ id: string }>("expenses", {
      categories: ["Food"], accountIds: ["hdfc"], minAmount: 100, maxAmount: 200, fromDate: "2026-01-01", toDate: "2026-03-31",
    });
    expect(rows).toEqual([{ amount: 120, id: "x" }]);
    expect(log).toEqual(expect.arrayContaining([
      ["eq", "source_deleted", false], ["is", "soft_deleted_at", null],
      ["in", "category", ["Food"]], ["in", "account_id", ["hdfc"]],
      ["gte", "amount", 99.99], ["lte", "amount", 200.01],
      ["gte", "date", "2026-01-01"], ["lte", "date", "2026-03-31"],
    ]));
  });
});
