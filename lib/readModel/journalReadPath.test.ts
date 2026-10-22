import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SPENDLY-511 — the Journal month load. In `firestore` mode it must be the
 * provider's previous query, unchanged: same path, same date range, same
 * read log, same soft-delete filter, and no read-model connection at all.
 */
const calls: unknown[][] = [];
vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => {
    calls.push(["collection", ...args.slice(1)]);
    return { path: args.slice(1).join("/") };
  },
  where: (...args: unknown[]) => ({ where: args }),
  query: (ref: unknown, ...constraints: unknown[]) => {
    calls.push(["query", ref, ...constraints]);
    return { ref, constraints };
  },
  getDocs: async () => ({
    metadata: { fromCache: false },
    docs: [
      { id: "e1", data: () => ({ amount: 10, date: "2026-03-04" }), metadata: { hasPendingWrites: false } },
      { id: "e2", data: () => ({ amount: 99, date: "2026-03-05", deletedAt: "2026-03-06T00:00:00Z" }), metadata: { hasPendingWrites: false } },
    ],
  }),
}));
const readLog = vi.fn();
vi.mock("@/lib/firestoreReadDebug", () => ({ logDirectRead: (...args: unknown[]) => readLog(...args) }));
vi.mock("@/lib/errors", () => ({ logWarning: vi.fn() }));
vi.mock("@/lib/readModelClient", () => ({ connectReadModel: vi.fn() }));

import { readJournalMonth, setJournalReadPathForTests } from "./journalReadPath";
import { createReadPath } from "./readPath";

const user = { uid: "u1", getIdToken: async () => "t", getIdTokenResult: async () => ({ claims: {} }) };

function fakeSupabase(rows: { doc_id: string; doc: Record<string, unknown> }[]) {
  const filters: unknown[][] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "gte", "lte", "eq", "is", "order", "range"]) {
    builder[m] = (...args: unknown[]) => {
      filters.push([m, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
  return { client: { from: (table: string) => (filters.push(["from", table]), builder) } as never, filters };
}

beforeEach(() => {
  calls.length = 0;
  readLog.mockClear();
  setJournalReadPathForTests(createReadPath({ timeoutMs: 500, log: () => {} }));
});

describe("Journal month load through the read path (SPENDLY-511)", () => {
  it("firestore mode (the default) runs the previous query unchanged and never connects", async () => {
    const connect = vi.fn();
    const rows = await readJournalMonth({
      db: {} as never, user, collectionName: "expenses", monthKey: "2026-03",
      conditions: { setting: undefined, online: true, duress: false }, locallyRemovedIds: new Set(), connect,
    });
    expect(connect).not.toHaveBeenCalled();
    expect(calls).toEqual([
      ["collection", "users", "u1", "expenses"],
      ["query", { path: "users/u1/expenses" }, { where: ["date", ">=", "2026-03-01"] }, { where: ["date", "<=", "2026-03-31"] }],
    ]);
    expect(readLog).toHaveBeenCalledWith("users/u1/expenses", 2, "server", { feature: "ledger_month_query", queryShape: "date range 2026-03" });
    // Soft-deleted rows are dropped, exactly as foldLedgerSnapshot(activeOnly) did.
    expect(rows).toEqual([{ amount: 10, date: "2026-03-04", id: "e1" }]);
  });

  it("an explicit firestore setting behaves the same", async () => {
    const connect = vi.fn();
    await readJournalMonth({
      db: {} as never, user, collectionName: "incomes", monthKey: "2026-03",
      conditions: { setting: { journal: "firestore" }, online: true, duress: false }, locallyRemovedIds: new Set(), connect,
    });
    expect(connect).not.toHaveBeenCalled();
    expect(calls[0]).toEqual(["collection", "users", "u1", "incomes"]);
  });

  it.each([
    ["a duress session", { online: true, duress: true }],
    ["offline", { online: false, duress: false }],
  ])("reads Firestore for %s, without connecting", async (_name, c) => {
    const connect = vi.fn();
    await readJournalMonth({
      db: {} as never, user, collectionName: "expenses", monthKey: "2026-03",
      conditions: { setting: { journal: "supabase" }, ...c }, locallyRemovedIds: new Set(), connect,
    });
    expect(connect).not.toHaveBeenCalled();
    expect(readLog).toHaveBeenCalled();
  });

  it("supabase mode reads the month from the read model, own rows via RLS, minus rows removed on this device", async () => {
    const fake = fakeSupabase([
      { doc_id: "e1", doc: { amount: 10, date: "2026-03-04" } },
      { doc_id: "gone", doc: { amount: 5, date: "2026-03-09" } },
    ]);
    const rows = await readJournalMonth({
      db: {} as never, user, collectionName: "expenses", monthKey: "2026-03",
      conditions: { setting: { journal: "supabase" }, online: true, duress: false },
      locallyRemovedIds: new Set(["gone"]),
      connect: vi.fn(async () => ({ access: "ok" as const, client: fake.client })),
    });
    expect(rows).toEqual([{ amount: 10, date: "2026-03-04", id: "e1" }]);
    expect(calls).toEqual([]); // no Firestore read
    expect(fake.filters).toEqual(expect.arrayContaining([
      ["from", "expenses"],
      ["gte", "date", "2026-03-01"],
      ["lte", "date", "2026-03-31"],
      ["eq", "source_deleted", false],
      ["is", "soft_deleted_at", null],
    ]));
  });

  it("no read-model client (unconfigured, no role claim) means Firestore", async () => {
    await readJournalMonth({
      db: {} as never, user, collectionName: "expenses", monthKey: "2026-03",
      conditions: { setting: { journal: "supabase" }, online: true, duress: false }, locallyRemovedIds: new Set(),
      connect: vi.fn(async () => ({ access: "not-configured" as const, client: null })),
    });
    expect(readLog).toHaveBeenCalled();
  });
});
