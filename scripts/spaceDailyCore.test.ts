import { describe, expect, it, vi } from "vitest";

import type { Expense } from "../shared/types/expense";
import { SPACES_SUMMARY_VERSION, type Space } from "../shared/types/space";
import { buildStoredSpaceTotals } from "../shared/utils/spaceMath";
import { jobReadBudget, type JobDb } from "./lib/dailyJobCore";
import { planSpaceWrites, runSpaceDaily, runSpaceQueue, STAMP, type SpaceRunQueue, type SpaceUserData } from "./lib/spaceDailyCore";

const hospital: Space = { id: "s1", userId: "u1", name: "Brother hospital", status: "ACTIVE", budget: 70000 };
const pandal: Space = { id: "s2", userId: "u1", name: "Ganesh pandal", status: "ACTIVE" };

function expense(id: string, date: string, amount: number, spaceId: string, over: Partial<Expense> = {}): Expense {
  return { id, date, amount, spaceId, category: "Medical", createdAt: null, ...over } as unknown as Expense;
}

// The reported case: the hospital's expenses are in August, a month the app hadn't loaded.
const EXPENSES = [
  expense("e1", "2026-08-04", 12000, "s1"),
  expense("e2", "2026-08-19", 3500, "s1", { category: "Pharmacy" }),
  expense("e3", "2026-11-02", 362, "s2", { category: "Festival" }),
];

function data(over: Partial<SpaceUserData> = {}): SpaceUserData {
  return { spaces: [hospital, pandal], expenses: EXPENSES, stored: null, ...over };
}

function fakeDb() {
  const sets: Array<{ path: string; data: Record<string, unknown>; options?: { merge?: boolean } }> = [];
  const db: JobDb = {
    doc: (path) => ({ path }),
    batch: () => ({
      create: () => undefined,
      set: (ref, d, options) => sets.push({ path: ref.path, data: d, options }),
      update: () => undefined,
      delete: () => undefined,
      commit: async () => undefined,
    }),
  };
  return { db, sets };
}

describe("space-daily (SPENDLY-791): Space totals on the server, any month", () => {
  it("counts every expense of a Space, whatever month it is in", () => {
    const plan = planSpaceWrites("u1", data());
    expect(plan.writes).toHaveLength(1);
    const w = plan.writes[0];
    expect(w).toMatchObject({ kind: "set", path: "users/u1/financialSummaries/spaces", merge: false, stampCreatedAt: true });
    const doc = w.kind === "set" ? w.data : {};
    expect(doc.summaryVersion).toBe(SPACES_SUMMARY_VERSION);
    expect(doc.calculatedAt).toBe(STAMP);
    const spaces = doc.spaces as Record<string, { totalSpent: number; expenseCount: number; firstExpenseDate: string | null }>;
    expect(spaces.s1).toMatchObject({ totalSpent: 15500, expenseCount: 2, firstExpenseDate: "2026-08-04" });
    expect(spaces.s2).toMatchObject({ totalSpent: 362, expenseCount: 1 });
  });

  it("leaves soft-deleted expenses out and gives an empty Space a zero entry", () => {
    const empty: Space = { id: "s3", userId: "u1", name: "Empty", status: "ACTIVE" };
    const plan = planSpaceWrites(
      "u1",
      data({ spaces: [hospital, empty], expenses: [...EXPENSES, expense("e4", "2026-08-20", 999, "s1", { deletedAt: "2026-08-21T00:00:00Z" })] })
    );
    const spaces = (plan.writes[0].kind === "set" ? plan.writes[0].data.spaces : {}) as Record<string, { totalSpent: number; expenseCount: number }>;
    expect(spaces.s1.totalSpent).toBe(15500);
    expect(spaces.s3).toMatchObject({ totalSpent: 0, expenseCount: 0 });
  });

  it("already stored and equal: nothing to write (no churn)", () => {
    const stored = { spaces: buildStoredSpaceTotals([hospital, pandal], EXPENSES), summaryVersion: SPACES_SUMMARY_VERSION };
    expect(planSpaceWrites("u1", data({ stored })).writes).toEqual([]);
  });

  it("an expense moved out of a Space, or a deleted Space, is replaced whole and keeps createdAt", () => {
    const stored = { spaces: buildStoredSpaceTotals([hospital, pandal], EXPENSES), summaryVersion: SPACES_SUMMARY_VERSION, createdAt: "<created>" };
    const plan = planSpaceWrites("u1", data({ spaces: [hospital], expenses: EXPENSES.filter((e) => e.id !== "e2"), stored }));
    const w = plan.writes[0];
    expect(w).toMatchObject({ kind: "set", merge: false, stampCreatedAt: false });
    const doc = w.kind === "set" ? w.data : {};
    expect(doc.createdAt).toBe("<created>");
    expect(Object.keys(doc.spaces as object)).toEqual(["s1"]);
    expect((doc.spaces as Record<string, { totalSpent: number }>).s1.totalSpent).toBe(12000);
  });

  it("no Spaces and nothing stored: nothing to write", () => {
    expect(planSpaceWrites("u1", { spaces: [], expenses: [], stored: null }).writes).toEqual([]);
  });

  it("runs through applyJobWrites with real server timestamps; duress skipped; dry run writes nothing", async () => {
    const { db, sets } = fakeDb();
    const ports = { listOwners: vi.fn(async () => ["u1", "u2_duress"]), load: vi.fn(async () => data()), db, stamp: () => "<ts>" };
    const s = await runSpaceDaily({ ports, dryRun: false, budget: jobReadBudget(1000), push: null, log: () => undefined });
    expect(s.counts.summariesWritten).toBe(1);
    expect(s.duressSkipped).toBe(1);
    expect(ports.load).toHaveBeenCalledTimes(1);
    expect(sets).toHaveLength(1);
    expect(sets[0].data.calculatedAt).toBe("<ts>");
    expect(sets[0].options).toBeUndefined(); // a whole replace, not a merge

    sets.length = 0;
    await runSpaceDaily({ ports, dryRun: true, budget: jobReadBudget(1000), push: null, log: () => undefined });
    expect(sets).toEqual([]);
  });

  it("queue mode serves only the queued users and clears what it served", async () => {
    const { db } = fakeDb();
    let pending = [
      { uid: "u1", requestedAt: "2026-11-19T10:00:00Z" },
      { uid: "x_duress", requestedAt: "2026-11-19T10:00:00Z" },
    ];
    const done = vi.fn(async (uid: string) => {
      pending = pending.filter((p) => p.uid !== uid);
    });
    const queue: SpaceRunQueue = { pending: async () => pending, done };
    const ports = { listOwners: vi.fn(async () => ["someone-else"]), load: vi.fn(async () => data()), db, stamp: () => "<ts>" };
    const s = await runSpaceQueue({ queue, ports, dryRun: false, budget: jobReadBudget(1000), push: null, log: () => undefined });
    expect(ports.listOwners).not.toHaveBeenCalled();
    expect(ports.load).toHaveBeenCalledWith("u1");
    expect(s.counts.queueUsers).toBe(1);
    expect(done).toHaveBeenCalledTimes(2);
    expect(pending).toEqual([]);
  });

  it("queue dry run reads once and clears nothing", async () => {
    const { db } = fakeDb();
    const done = vi.fn(async () => undefined);
    const queue: SpaceRunQueue = { pending: async () => [{ uid: "u1", requestedAt: "t" }], done };
    const ports = { listOwners: vi.fn(async () => []), load: vi.fn(async () => data()), db, stamp: () => "<ts>" };
    await runSpaceQueue({ queue, ports, dryRun: true, budget: jobReadBudget(1000), push: null, log: () => undefined });
    expect(done).not.toHaveBeenCalled();
  });
});
