import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SPENDLY-513 — Insights, cash-flow history, audit history and cashback on
 * the read path. Each has its own switch; `firestore` (the default) never
 * connects and leaves the screen exactly as before.
 */
let emulator: Record<string, { id: string; data: () => Record<string, unknown> }[]> = {};
const reads: string[] = [];
const queries: unknown[][] = [];
vi.mock("firebase/firestore", () => ({
  Timestamp: { fromMillis: (ms: number) => ({ __ts: ms, toMillis: () => ms }) },
  collection: (...args: unknown[]) => ({ path: args.slice(1).join("/") }),
  where: (...args: unknown[]) => ({ where: args }),
  query: (ref: { path: string }, ...constraints: unknown[]) => {
    queries.push([ref.path, ...constraints]);
    return ref;
  },
  getDocs: async (ref: { path: string }) => {
    reads.push(ref.path);
    const coll = ref.path.split("/").at(-1) ?? "";
    return { metadata: { fromCache: false }, docs: (emulator[coll] ?? []).map((d) => ({ ...d, metadata: { hasPendingWrites: false } })) };
  },
}));
vi.mock("@/lib/firestoreReadDebug", () => ({ logDirectRead: vi.fn() }));
vi.mock("@/lib/errors", () => ({ logWarning: vi.fn() }));
vi.mock("@/lib/readModelClient", () => ({ connectReadModel: vi.fn() }));

import {
  auditCursorBelow,
  compareAuditIds,
  compareCashFlow,
  readAuditPage,
  readCashbackLinkedExpenses,
  readCashFlowHistory,
  readInsightsMonth,
  shadowCompareAudit,
  shadowCompareCashFlow,
} from "./analyticsReadPath";
import { cashFlowFromRows, cashFlowFromView, ReadModelMissingAmount, supabaseCashFlow } from "./analyticsSources";
import { createReadPath } from "./readPath";
import { setReadModelPathForTests } from "./screenReadPath";

const d = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });
const user = { uid: "u1", getIdToken: async () => "t", getIdTokenResult: async () => ({ claims: {} }) };
const conditions = (screen: string, mode: string | undefined, extra: Record<string, unknown> = {}) => ({
  setting: mode ? { [screen]: mode, ...extra } : undefined,
  online: true,
  duress: false,
  localTestMode: true,
});
let log: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  reads.length = 0;
  queries.length = 0;
  log = vi.fn();
  setReadModelPathForTests(createReadPath({ timeoutMs: 500, log, shadowLogIntervalMs: 0 }));
  emulator = {
    expenses: [
      d("e1", { amount: 100.1, date: "2026-03-05", category: "Food", note: "Cafe" }),
      d("e2", { amount: 50.2, date: "2026-03-20", category: "Fuel" }),
      d("e3", { amount: 7, date: "2026-02-02", category: "Food" }),
      d("gone", { amount: 999, date: "2026-03-06", category: "Food", deletedAt: "2026-03-07T00:00:00Z" }),
    ],
    incomes: [d("i1", { amount: 1000, date: "2026-03-01" }), d("i2", { amount: 20, date: "2026-02-28" })],
    ledgerEvents: [
      d("ev1", { docId: "e1", kind: "expense", action: "update", createdAt: "2026-03-05T10:00:00.000Z" }),
      d("ev2", { docId: "e1", kind: "expense", action: "update", createdAt: "2026-03-06T10:00:00.000Z" }),
      d("ev3", { docId: "e2", kind: "expense", action: "delete", createdAt: "2026-03-07T10:00:00.000Z" }),
      d("ev4", { docId: "e1", kind: "expense", action: "restore", createdAt: "2026-03-06T10:00:00.000Z" }),
    ],
  };
});

describe("firestore mode (the default) changes nothing (SPENDLY-513)", () => {
  it("every source returns null, never connects and reads nothing", async () => {
    const connect = vi.fn();
    const base = { db: {} as never, user, connect };
    for (const setting of [undefined, { insights: "firestore", cashFlow: "firestore", audit: "firestore", cashback: "firestore" }]) {
      const c = { setting, online: true, duress: false };
      expect(await readInsightsMonth({ ...base, conditions: c, monthKey: "2026-03", locallyRemovedIds: new Set() })).toBeNull();
      expect(await readCashFlowHistory({ ...base, conditions: c, fromMonth: "2026-01", toMonth: "2026-02", firestore: vi.fn() })).toBeNull();
      expect(await readAuditPage({ ...base, conditions: c, cursor: null, targetDocId: "e1", pageSize: 100 })).toBeNull();
      expect(await readCashbackLinkedExpenses({ ...base, conditions: c, missingIds: ["e1"], locallyRemovedIds: new Set() })).toBeNull();
      expect(await shadowCompareCashFlow({ ...base, conditions: c, shown: [], months: ["2026-03"] })).toBe(false);
      expect(await shadowCompareAudit({ ...base, conditions: c, docId: "e1", firestoreEvents: [] })).toBe(false);
    }
    expect(connect).not.toHaveBeenCalled();
    expect(reads).toEqual([]);
  });

  it("each screen has its own switch: the Journal's setting doesn't move Insights", async () => {
    const c = { setting: { journal: "supabase" }, online: true, duress: false, localTestMode: true };
    expect(await readInsightsMonth({ db: {} as never, user, conditions: c, monthKey: "2026-03", locallyRemovedIds: new Set() })).toBeNull();
  });
});

describe("Insights month (SPENDLY-513)", () => {
  it("supabase: the month's complete live rows, minus rows removed on this device", async () => {
    const month = await readInsightsMonth<{ id: string }, { id: string }>({
      db: {} as never, user, conditions: conditions("insights", "supabase"), monthKey: "2026-03", locallyRemovedIds: new Set(["e2"]),
    });
    expect(month?.expenses.map((r) => r.id)).toEqual(["e1"]);
    expect(month?.incomes.map((r) => r.id)).toEqual(["i1"]);
  });

  it("a read-model failure returns null (the screen uses its own rows) and the screen stays on Firestore", async () => {
    const c = conditions("insights", "supabase", { loopbackFail: true });
    expect(await readInsightsMonth({ db: {} as never, user, conditions: c, monthKey: "2026-03", locallyRemovedIds: new Set() })).toBeNull();
    expect(log).toHaveBeenCalledWith("readModel.fallback.insights", expect.anything());
  });

  it("shadow compares against the bounded Firestore month query and returns null", async () => {
    expect(await readInsightsMonth({ db: {} as never, user, conditions: conditions("insights", "shadow"), monthKey: "2026-03", locallyRemovedIds: new Set() })).toBeNull();
    expect(queries.some((q) => q[0] === "users/u1/expenses" && JSON.stringify(q).includes('"2026-03-01"'))).toBe(true);
  });
});

describe("cash-flow history (SPENDLY-513)", () => {
  it("supabase: older months from the read model, by month, live rows only", async () => {
    const firestore = vi.fn();
    const result = await readCashFlowHistory({ db: {} as never, user, conditions: conditions("cashFlow", "supabase"), fromMonth: "2026-01", toMonth: "2026-03", firestore });
    expect(result).toEqual({
      servedBy: "supabase",
      months: [
        { period: "2026-03", totalExpenses: 150.3, totalIncome: 1000, transactionCount: 3 },
        { period: "2026-02", totalExpenses: 7, totalIncome: 20, transactionCount: 2 },
      ],
    });
    expect(firestore).not.toHaveBeenCalled();
  });

  it("a failure serves the bounded summary-doc read instead", async () => {
    const firestore = vi.fn(async () => [{ period: "2026-02", totalExpenses: 1, totalIncome: 2, transactionCount: 1 }]);
    const result = await readCashFlowHistory({
      db: {} as never, user, conditions: conditions("cashFlow", "supabase", { loopbackFail: true }), fromMonth: "2026-01", toMonth: "2026-02", firestore,
    });
    expect(result?.servedBy).toBe("firestore");
    expect(firestore).toHaveBeenCalledTimes(1);
  });

  it("a missing amount is never shown as 0: the read fails (and falls back)", () => {
    expect(() => cashFlowFromView([{ month: "2026-01", total_expenses: null, total_income: 5, transaction_count: 1 }])).toThrow(ReadModelMissingAmount);
  });

  it("reads the view with the month range", async () => {
    const calls: unknown[][] = [];
    const b: Record<string, unknown> = {};
    for (const m of ["select", "gte", "lte"]) b[m] = (...a: unknown[]) => (calls.push([m, ...a]), b);
    b.then = (r: (v: unknown) => unknown) => r({ data: [{ month: "2026-01", total_expenses: "10.10", total_income: 0, transaction_count: 1 }], error: null });
    const rows = await supabaseCashFlow({ from: (t: string) => (calls.push(["from", t]), b) } as never, "2026-01", "2026-04");
    expect(rows).toEqual([{ period: "2026-01", totalExpenses: 10.1, totalIncome: 0, transactionCount: 1 }]);
    expect(calls).toEqual(expect.arrayContaining([["from", "v_cash_flow_by_month"], ["gte", "month", "2026-01"], ["lte", "month", "2026-04"]]));
  });

  it("shadow compares to the paisa and logs differences", async () => {
    const shown = [{ period: "2026-03", totalExpenses: 150.31, totalIncome: 1000, transactionCount: 3 }];
    expect(await shadowCompareCashFlow({ db: {} as never, user, conditions: conditions("cashFlow", "shadow"), shown, months: ["2026-03", "2026-02"] })).toBe(true);
    await vi.waitFor(() => expect(log).toHaveBeenCalled());
    expect(log).toHaveBeenCalledWith("readModel.shadow.cashFlow", {
      differences: ["2026-03 expenses 150.31 vs 150.30", "2026-02 expenses 0.00 vs 7.00", "2026-02 income 0.00 vs 20.00"],
      count: 3,
    });
    expect(compareCashFlow(shown, shown, ["2026-03"])).toEqual([]);
  });
});

describe("audit history (SPENDLY-513)", () => {
  it("supabase: one transaction's events page newest first from the read model", async () => {
    const page = await readAuditPage<{ id: string }>({ db: {} as never, user, conditions: conditions("audit", "supabase"), cursor: null, targetDocId: "e1", pageSize: 2 });
    expect(page?.items.map((e) => e.id)).toEqual(["ev4", "ev2"]);
    expect(page?.next).toEqual({ createdAt: "2026-03-06T10:00:00.000Z", docId: "ev2" });
    const p2 = await readAuditPage<{ id: string }>({ db: {} as never, user, conditions: conditions("audit", "supabase"), cursor: page!.next, targetDocId: "e1", pageSize: 2 });
    expect(p2?.items.map((e) => e.id)).toEqual(["ev1"]);
    expect(p2?.next).toBe("undated");
  });

  it("returns null in shadow, and on failure (the hook falls back to its listener)", async () => {
    expect(await readAuditPage({ db: {} as never, user, conditions: conditions("audit", "shadow"), cursor: null, pageSize: 10 })).toBeNull();
    expect(await readAuditPage({ db: {} as never, user, conditions: conditions("audit", "supabase", { loopbackFail: true }), cursor: null, pageSize: 10 })).toBeNull();
  });

  it("the first read-model page below the realtime window includes every row at that millisecond", () => {
    expect(auditCursorBelow(Date.parse("2026-03-06T10:00:00.000Z"))).toEqual({ createdAt: "2026-03-06T10:00:00.001Z", docId: "" });
  });

  it("shadow ignores events newer than the sync SLO (not synced yet is not a difference)", () => {
    const now = Date.parse("2026-03-07T12:00:00Z");
    const fs = [
      { id: "old", createdAt: { toMillis: () => now - 4 * 3600_000 } },
      { id: "new", createdAt: { toMillis: () => now - 60_000 } },
    ];
    expect(compareAuditIds(fs, [], now)).toEqual(["missing in read model: old"]);
    expect(compareAuditIds(fs, [{ id: "old" }, { id: "x" }], now)).toEqual(["only in read model: x"]);
  });
});

describe("cashback linked purchases (SPENDLY-513)", () => {
  it("supabase: fetches the missing linked purchases, minus rows removed on this device", async () => {
    const rows = await readCashbackLinkedExpenses<{ id: string }>({
      db: {} as never, user, conditions: conditions("cashback", "supabase"), missingIds: ["e1", "e3", "gone"], locallyRemovedIds: new Set(["e3"]),
    });
    expect(rows?.map((r) => r.id)).toEqual(["e1"]);
  });

  it("does nothing when nothing is missing, and returns null in shadow", async () => {
    const connect = vi.fn();
    expect(await readCashbackLinkedExpenses({ db: {} as never, user, connect, conditions: conditions("cashback", "supabase"), missingIds: [], locallyRemovedIds: new Set() })).toBeNull();
    expect(connect).not.toHaveBeenCalled();
    expect(await readCashbackLinkedExpenses({ db: {} as never, user, conditions: conditions("cashback", "shadow"), missingIds: ["e1"], locallyRemovedIds: new Set() })).toBeNull();
  });
});

describe("loopback cash flow follows the view's rules", () => {
  it("skips rows with no month and keeps months with only income", () => {
    const row = (month: string | null, amount: number | null) => ({ month, amount } as never);
    expect(cashFlowFromRows([row(null, 5)], [row("2026-01", 3)], "2026-01", "2026-12")).toEqual([
      { period: "2026-01", totalExpenses: 0, totalIncome: 3, transactionCount: 1 },
    ]);
    expect(() => cashFlowFromRows([row("2026-01", null)], [], "2026-01", "2026-01")).toThrow(ReadModelMissingAmount);
  });
});
