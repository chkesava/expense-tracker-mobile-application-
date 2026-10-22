import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SPENDLY-512 — older Journal pages. In `firestore` mode the page is the
 * provider's previous cursor query, unchanged; in `supabase` mode keyset
 * pages come from the read model; a failure falls back to the bounded
 * Firestore cursor page.
 */
const calls: unknown[][] = [];
let firestoreDocs: { id: string; data: () => Record<string, unknown>; metadata: { hasPendingWrites: boolean } }[] = [];
vi.mock("firebase/firestore", () => ({
  Timestamp: { fromMillis: (ms: number) => ({ __ts: ms }) },
  collection: (...args: unknown[]) => ({ path: args.slice(1).join("/") }),
  where: (...args: unknown[]) => ({ where: args }),
  orderBy: (...args: unknown[]) => ({ orderBy: args }),
  startAfter: (...args: unknown[]) => ({ startAfter: args }),
  limit: (n: number) => ({ limit: n }),
  query: (ref: unknown, ...constraints: unknown[]) => {
    calls.push(["query", ref, ...constraints]);
    return { ref, constraints };
  },
  getDocs: async () => ({ metadata: { fromCache: false }, docs: firestoreDocs }),
}));
const readLog = vi.fn();
vi.mock("@/lib/firestoreReadDebug", () => ({ logDirectRead: (...args: unknown[]) => readLog(...args) }));
vi.mock("@/lib/errors", () => ({ logWarning: vi.fn() }));
vi.mock("@/lib/readModelClient", () => ({ connectReadModel: vi.fn() }));

import { keysetAfter, supabaseJournalPage } from "./journalHistorySource";
import { readJournalPage, setJournalReadPathForTests, shadowCompareJournalHistory } from "./journalReadPath";
import { fromReadModelDoc } from "./readModelDoc";
import { createReadPath } from "./readPath";

const user = { uid: "u1", getIdToken: async () => "t", getIdTokenResult: async () => ({ claims: {} }) };
const doc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data, metadata: { hasPendingWrites: false } });
const cursor = { id: "last-staged" } as never;

/** A supabase-js-like builder that records calls and answers from `pages` in turn. */
function fakeSupabase(pages: { doc_id: string; date: string | null; doc: Record<string, unknown> }[][], fail = false) {
  const log: unknown[][] = [];
  let n = 0;
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "not", "or", "order", "limit"]) {
    builder[m] = (...args: unknown[]) => {
      log.push([m, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve(fail ? { data: null, error: { message: "paused" } } : { data: pages[n++] ?? [], error: null });
  return { client: { from: (t: string) => (log.push(["from", t]), builder) } as never, log };
}

const row = (i: number, date: string | null = `2026-01-${String(28 - (i % 28)).padStart(2, "0")}`) => ({
  doc_id: `d${String(i).padStart(3, "0")}`,
  date,
  doc: { amount: i, date, createdAt: "2026-01-01T10:00:00.000Z" },
});

beforeEach(() => {
  calls.length = 0;
  readLog.mockClear();
  firestoreDocs = [];
  setJournalReadPathForTests(createReadPath({ timeoutMs: 500, log: () => {} }));
});

describe("older Journal pages (SPENDLY-512)", () => {
  it("firestore mode (default) runs the previous cursor query unchanged and never connects", async () => {
    firestoreDocs = [doc("a", { amount: 1, date: "2025-12-01" }), doc("gone", { amount: 9, date: "2025-12-02", deletedAt: "x" })];
    const connect = vi.fn();
    const page = await readJournalPage({
      db: {} as never, user, collectionName: "expenses", firestoreCursor: cursor, supabaseCursor: null,
      conditions: { setting: undefined, online: true, duress: false }, locallyRemovedIds: new Set(), connect,
    });
    expect(connect).not.toHaveBeenCalled();
    expect(calls).toEqual([
      ["query", { path: "users/u1/expenses" }, { orderBy: ["createdAt", "desc"] }, { startAfter: [cursor] }, { limit: 50 }],
    ]);
    expect(readLog).toHaveBeenCalledWith("users/u1/expenses", 2, "server", { feature: "ledger_pagination", queryShape: "startAfter limit=50" });
    expect(page).toMatchObject({ servedBy: "firestore", exhausted: true, items: [{ id: "a", amount: 1, date: "2025-12-01" }] });
    expect((page as { lastDoc: { id: string } }).lastDoc.id).toBe("gone");
  });

  it("shadow mode pages from Firestore (histories are compared whole, not per page)", async () => {
    const connect = vi.fn(async () => ({ access: "ok" as const, client: fakeSupabase([]).client }));
    const page = await readJournalPage({
      db: {} as never, user, collectionName: "incomes", firestoreCursor: cursor, supabaseCursor: null,
      conditions: { setting: { journal: "shadow" }, online: true, duress: false }, locallyRemovedIds: new Set(), connect,
    });
    expect(page?.servedBy).toBe("firestore");
  });

  it("supabase mode pages the read model by date, with no Firestore read, minus rows removed on this device", async () => {
    const fake = fakeSupabase([[row(1), row(2)]]);
    const page = await readJournalPage({
      db: {} as never, user, collectionName: "expenses", firestoreCursor: cursor, supabaseCursor: { date: "2026-02-01", docId: "z" },
      conditions: { setting: { journal: "supabase" }, online: true, duress: false }, locallyRemovedIds: new Set(["d002"]),
      connect: vi.fn(async () => ({ access: "ok" as const, client: fake.client })),
    });
    expect(calls).toEqual([]);
    expect(page).toMatchObject({ servedBy: "supabase", exhausted: false, next: "undated" });
    expect(page?.items.map((r: { id?: string }) => r.id)).toEqual(["d001"]);
    expect(fake.log).toEqual(expect.arrayContaining([
      ["eq", "source_deleted", false], ["is", "soft_deleted_at", null], ["not", "date", "is", null],
      ["or", keysetAfter({ date: "2026-02-01", docId: "z" })],
      ["order", "date", { ascending: false }], ["order", "doc_id", { ascending: false }], ["limit", 50],
    ]));
  });

  it("falls back to the bounded Firestore cursor page when the read model fails", async () => {
    firestoreDocs = [doc("a", { amount: 1, date: "2025-12-01" })];
    const page = await readJournalPage({
      db: {} as never, user, collectionName: "expenses", firestoreCursor: cursor, supabaseCursor: null,
      conditions: { setting: { journal: "supabase" }, online: true, duress: false }, locallyRemovedIds: new Set(),
      connect: vi.fn(async () => ({ access: "ok" as const, client: fakeSupabase([], true).client })),
    });
    expect(page?.servedBy).toBe("firestore");
    expect(calls[0]).toContainEqual({ limit: 50 });
  });
});

describe("read-model keyset paging (SPENDLY-512)", () => {
  it("walks full pages, then undated rows, then reports the history complete", async () => {
    const full = Array.from({ length: 50 }, (_, i) => row(i));
    const fake = fakeSupabase([full, [row(60)], [row(70, null)]]);
    const p1 = await supabaseJournalPage(fake.client, "expenses", null);
    expect(p1).toMatchObject({ exhausted: false, next: { date: full[49].date, docId: full[49].doc_id } });
    const p2 = await supabaseJournalPage(fake.client, "expenses", p1.next);
    expect(p2).toMatchObject({ exhausted: false, next: "undated" });
    const p3 = await supabaseJournalPage(fake.client, "expenses", p2.next);
    expect(p3).toMatchObject({ exhausted: true, next: null });
    expect(p3.items).toHaveLength(1);
  });

  it("quotes cursor values so a doc id can't break the filter", () => {
    expect(keysetAfter({ date: "2026-01-02", docId: 'a"b,c' })).toBe('date.lt."2026-01-02",and(date.eq."2026-01-02",doc_id.lt."a\\"b,c")');
  });

  it("gives back the object Firestore would: Timestamps restored, id set", () => {
    const restored = fromReadModelDoc<Record<string, unknown>>("e1", { amount: 5, createdAt: "2026-01-01T10:00:00.000Z", note: "x" });
    expect(restored).toEqual({ amount: 5, createdAt: { __ts: Date.parse("2026-01-01T10:00:00.000Z") }, note: "x", id: "e1" });
  });
});

describe("shadow comparison of a whole history (SPENDLY-512)", () => {
  it("logs ids missing or different once Firestore has loaded everything", async () => {
    const fake = fakeSupabase([[row(1), row(2)], [], []]);
    const log = vi.fn();
    const diffs = await shadowCompareJournalHistory({
      user, collectionName: "expenses",
      loaded: [{ id: "d001", amount: 1, date: row(1).date }, { id: "d002", amount: 99, date: row(2).date }, { id: "local-only", amount: 3, date: "2026-01-03" }],
      conditions: { setting: { journal: "shadow" }, online: true, duress: false },
      connect: vi.fn(async () => ({ access: "ok" as const, client: fake.client })), log,
    });
    expect(diffs).toEqual(["differs: d002", "missing in read model: local-only"]);
    expect(log).toHaveBeenCalledWith("readModel.shadow.journal.history", expect.objectContaining({ count: 2 }));
  });

  it("does nothing outside shadow mode", async () => {
    const connect = vi.fn();
    expect(await shadowCompareJournalHistory({
      user, collectionName: "expenses", loaded: [], conditions: { setting: undefined, online: true, duress: false }, connect,
    })).toBeNull();
    expect(connect).not.toHaveBeenCalled();
  });
});
