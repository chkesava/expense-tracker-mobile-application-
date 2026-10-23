import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SPENDLY-520 drill D3, app side: the read model is down (paused, unreachable,
 * erroring) while every screen is in `supabase` mode. Each screen must fall
 * back to its bounded Firestore source (or to the rows it already holds), not
 * crash, not retry in a loop, and say so with the fallback banner, so no
 * screen presents read-model values as current.
 *
 * The outage is the loopback's `loopbackFail` knob: the same code path as a
 * Supabase error, with no network.
 */
const queries: unknown[][] = [];
vi.mock("firebase/firestore", () => ({
  Timestamp: { fromMillis: (ms: number) => ({ __ts: ms, toMillis: () => ms }) },
  collection: (...args: unknown[]) => ({ path: args.slice(1).join("/") }),
  where: (...args: unknown[]) => ({ where: args }),
  orderBy: (...args: unknown[]) => ({ orderBy: args }),
  startAfter: (...args: unknown[]) => ({ startAfter: args }),
  limit: (n: number) => ({ limit: n }),
  query: (ref: { path: string }, ...constraints: unknown[]) => {
    queries.push([ref.path, ...constraints]);
    return ref;
  },
  getDocs: async () => ({ metadata: { fromCache: false }, docs: [] }),
}));
vi.mock("@/lib/firestoreReadDebug", () => ({ logDirectRead: vi.fn() }));
vi.mock("@/lib/errors", () => ({ logWarning: vi.fn() }));
vi.mock("@/lib/readModelClient", () => ({ connectReadModel: vi.fn() }));

import { READ_MODEL_SCREENS } from "@/shared/utils/readModelMode";
import { readModelFreshness, READ_MODEL_FALLBACK_LABEL } from "@/shared/utils/readModelFreshness";

import { readAuditPage, readCashbackLinkedExpenses, readCashFlowHistory, readInsightsMonth } from "./analyticsReadPath";
import { readJournalMatches, readJournalMonth, readJournalPage } from "./journalReadPath";
import { createReadPath, type ReadPath } from "./readPath";
import { readModelPath, setReadModelPathForTests } from "./screenReadPath";

const user = { uid: "u1", getIdToken: async () => "t", getIdTokenResult: async () => ({ claims: {} }) };
const allSupabaseDown = {
  setting: { ...Object.fromEntries(READ_MODEL_SCREENS.map((s) => [s, "supabase"])), loopbackFail: true },
  online: true,
  duress: false,
  localTestMode: true,
};
let log: ReturnType<typeof vi.fn>;
let path: ReadPath;

beforeEach(() => {
  queries.length = 0;
  log = vi.fn();
  path = createReadPath({ timeoutMs: 500, log });
  setReadModelPathForTests(path);
});

describe("drill D3: the read model is down, every screen in supabase mode (SPENDLY-520)", () => {
  it("every screen falls back, nothing throws, and each says so", async () => {
    const base = { db: {} as never, user, conditions: allSupabaseDown };
    const removed = new Set<string>();
    const firestoreCashFlow = vi.fn(async () => [{ period: "2026-06", totalExpenses: 1, totalIncome: 2, transactionCount: 1 }]);

    // journal: the month comes from the bounded Firestore date-range query.
    expect(await readJournalMonth({ ...base, collectionName: "expenses", monthKey: "2026-06", locallyRemovedIds: removed })).toEqual([]);
    // insights / audit / cashback: null = the screen keeps the rows it holds (today's behaviour).
    expect(await readInsightsMonth({ ...base, monthKey: "2026-06", locallyRemovedIds: removed })).toBeNull();
    expect(await readAuditPage({ ...base, cursor: null, targetDocId: "e1", pageSize: 100 })).toBeNull();
    expect(await readCashbackLinkedExpenses({ ...base, missingIds: ["e1"], locallyRemovedIds: removed })).toBeNull();
    // cashFlow: the bounded summary-doc read serves the chart.
    expect(await readCashFlowHistory({ ...base, fromMonth: "2026-03", toMonth: "2026-06", firestore: firestoreCashFlow })).toMatchObject({ servedBy: "firestore" });
    expect(firestoreCashFlow).toHaveBeenCalledTimes(1);

    for (const screen of READ_MODEL_SCREENS) {
      expect(readModelPath().fellBack(screen)).toBe(true);
      expect(log).toHaveBeenCalledWith(`readModel.fallback.${screen}`, expect.anything());
    }
    // The banner every screen shows once it fell back.
    expect(readModelFreshness({ fellBack: true, lastSyncedAtMs: null, newestLocalWriteMs: null, nowMs: 0, formatTime: String }).label).toBe(READ_MODEL_FALLBACK_LABEL);
  });

  it("after falling back, later reads go straight to Firestore: no retry loop, logged once per screen", async () => {
    const base = { db: {} as never, user, conditions: allSupabaseDown };
    for (let i = 0; i < 3; i++) {
      await readJournalMonth({ ...base, collectionName: "incomes", monthKey: "2026-06", locallyRemovedIds: new Set() });
    }
    expect(log.mock.calls.filter(([event]) => event === "readModel.fallback.journal")).toHaveLength(1);
  });

  it("Firestore fallbacks stay bounded: Journal pages are limit(50), month loads are one month's date range", async () => {
    const base = { db: {} as never, user, conditions: allSupabaseDown };
    await readJournalPage({ ...base, collectionName: "expenses", firestoreCursor: { id: "c" } as never, supabaseCursor: null, locallyRemovedIds: new Set() });
    await readJournalMonth({ ...base, collectionName: "expenses", monthKey: "2026-06", locallyRemovedIds: new Set() });
    expect(queries).toContainEqual(expect.arrayContaining([{ limit: 50 }]));
    expect(JSON.stringify(queries)).toContain('"2026-06-01"');
    expect(JSON.stringify(queries)).toContain('"2026-06-30"');
    // Filter matches never fall back to an unbounded Firestore read: they simply don't run.
    expect(await readJournalMatches({ ...base, collectionName: "expenses", match: { categories: ["Food"] }, locallyRemovedIds: new Set() })).toBeNull();
  });
});
