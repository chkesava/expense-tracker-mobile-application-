import { describe, expect, it, vi } from "vitest";

import type { CreditCardBill } from "../shared/types/creditCardBill";
import type { Account } from "../shared/types/expense";
import type { Subscription } from "../shared/types/subscription";
import { AUTO_DEBIT_SHORTFALL_ENGINE_VERSION } from "../shared/utils/autoDebitShortfall";
import { SERVER_RESULTS_VERSION, autoDebitShortfallFromDocs } from "../shared/utils/serverResults";
import { jobReadBudget, type JobDb } from "./lib/dailyJobCore";
import {
  planAutoDebitWrites,
  runAutoDebitDaily,
  runAutoDebitQueue,
  userToday,
  type AutoDebitRunQueue,
  type AutoDebitUserData,
} from "./lib/autoDebitDailyCore";

// 11:30 IST on 2026-11-20.
const NOW = new Date("2026-11-20T06:00:00Z");
const RUN = NOW.toISOString();

const bank: Account = { id: "bank1", name: "HDFC Savings", typeId: "t-bank", currentBalance: 10000, balanceReconciliationStatus: "healthy" };
const emi: Subscription = {
  id: "emi1",
  name: "Home loan EMI",
  amount: 12000,
  category: "EMI",
  dayOfMonth: 22,
  isActive: true,
  lastProcessed: "2026-10",
  type: "emi",
  accountId: "bank1",
};

function data(over: Partial<AutoDebitUserData> = {}): AutoDebitUserData {
  return {
    settings: { timezone: "Asia/Kolkata", defaultLeadDays: 3 },
    subscriptions: [emi],
    accounts: [bank],
    accountTypes: [{ id: "t-bank", name: "Bank Account" } as never, { id: "t-cc", name: "Credit Card" } as never],
    creditCardBills: [] as CreditCardBill[],
    groupFunds: [],
    stored: null,
    ...over,
  };
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

/** What the job stored, as the doc it would read back. */
function storedFrom(plan: ReturnType<typeof planAutoDebitWrites>): Record<string, unknown> {
  const w = plan.writes[0]!;
  return w.kind === "set" ? JSON.parse(JSON.stringify(w.data)) : {};
}

describe("autodebit-daily (SPENDLY-796)", () => {
  it("uses the user's own day, from their timezone", () => {
    expect(userToday(new Date("2026-11-20T20:00:00Z"), "Asia/Kolkata")).toBe("2026-11-21");
    expect(userToday(new Date("2026-11-20T20:00:00Z"), "UTC")).toBe("2026-11-20");
    expect(userToday(NOW, undefined)).toBe("2026-11-20"); // defaults to Asia/Kolkata
    expect(userToday(NOW, "Mars/Base")).toBeNull();
  });

  it("stores the shortfall result for the user's day", () => {
    const plan = planAutoDebitWrites("u1", data(), NOW, RUN);
    expect(plan).toMatchObject({ accounts: 1, hasShortfall: true });
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0]).toMatchObject({
      kind: "set",
      path: "users/u1/serverResults/autoDebitShortfall",
      merge: true,
      stampCreatedAt: true,
    });
    const stored = autoDebitShortfallFromDocs([{ id: "autoDebitShortfall", data: storedFrom(plan) }])!;
    expect(stored).toMatchObject({ runId: RUN, today: "2026-11-20", hasShortfall: true, engineVersion: AUTO_DEBIT_SHORTFALL_ENGINE_VERSION });
    expect(stored.accounts[0]).toMatchObject({ accountId: "bank1", available: 10000, shortBy: 2000 });
  });

  it("passes the user's default lead days and card types to the engine", () => {
    // Due the 22nd: with 1 lead day the window opens on the 21st, so nothing alerts today.
    expect(planAutoDebitWrites("u1", data({ settings: { timezone: "Asia/Kolkata", defaultLeadDays: 1 } }), NOW, RUN)).toMatchObject({ writes: [], accounts: 0 });
    // A bad stored default falls back to 3.
    expect(planAutoDebitWrites("u1", data({ settings: { timezone: "Asia/Kolkata", defaultLeadDays: 99 } }), NOW, RUN).hasShortfall).toBe(true);
    // An EMI charged to a card isn't a balance shortfall.
    const card: Account = { id: "card1", name: "Card", typeId: "t-cc" };
    expect(planAutoDebitWrites("u1", data({ accounts: [bank, card], subscriptions: [{ ...emi, accountId: "card1" }] }), NOW, RUN).writes).toEqual([]);
  });

  it("the same day and the same result: nothing to write (no churn)", () => {
    const stored = storedFrom(planAutoDebitWrites("u1", data(), NOW, RUN));
    expect(planAutoDebitWrites("u1", data({ stored }), NOW, "later-run").writes).toEqual([]);
  });

  it("a new day rewrites, even when the figures are the same", () => {
    const stored = storedFrom(planAutoDebitWrites("u1", data(), NOW, RUN));
    const tomorrow = new Date("2026-11-21T06:00:00Z");
    const plan = planAutoDebitWrites("u1", data({ stored }), tomorrow, "r2");
    expect(plan.writes[0]).toMatchObject({ merge: true, stampCreatedAt: false });
  });

  it("a top-up clears the stored shortfall", () => {
    const stored = storedFrom(planAutoDebitWrites("u1", data(), NOW, RUN));
    const plan = planAutoDebitWrites("u1", data({ stored, accounts: [{ ...bank, currentBalance: 50000 }] }), NOW, "r2");
    expect(plan.writes).toHaveLength(1);
    expect(storedFrom(plan)).toMatchObject({ hasShortfall: false, accounts: [] });
  });

  it("an engine or result version change rewrites", () => {
    const stored = { ...storedFrom(planAutoDebitWrites("u1", data(), NOW, RUN)), version: SERVER_RESULTS_VERSION - 1 };
    expect(planAutoDebitWrites("u1", data({ stored }), NOW, "r2").writes).toHaveLength(1);
  });

  it("nothing to check and nothing stored: no document", () => {
    expect(planAutoDebitWrites("u1", data({ subscriptions: [] }), NOW, RUN).writes).toEqual([]);
  });

  it("an invalid timezone is skipped, not guessed", () => {
    expect(planAutoDebitWrites("u1", data({ settings: { timezone: "Mars/Base" } }), NOW, RUN)).toMatchObject({ writes: [], invalidTimeZone: true });
  });

  it("runs through applyJobWrites; duress skipped; dry run writes nothing", async () => {
    const { db, sets } = fakeDb();
    const ports = { listOwners: vi.fn(async () => ["u1", "u2_duress"]), load: vi.fn(async () => data()), db, stamp: () => "<ts>" };
    const s = await runAutoDebitDaily({ ports, now: NOW, dryRun: false, budget: jobReadBudget(1000), push: null, log: () => undefined });
    expect(s.counts.resultsWritten).toBe(1);
    expect(s.counts.usersShort).toBe(1);
    expect(s.duressSkipped).toBe(1);
    expect(ports.load).toHaveBeenCalledTimes(1);
    expect(sets).toHaveLength(1);
    expect(sets[0]!.path).toBe("users/u1/serverResults/autoDebitShortfall");
    expect(sets[0]!.options).toEqual({ merge: true });

    sets.length = 0;
    await runAutoDebitDaily({ ports, now: NOW, dryRun: true, budget: jobReadBudget(1000), push: null, log: () => undefined });
    expect(sets).toEqual([]);
  });

  it("counts an invalid timezone instead of writing", async () => {
    const { db, sets } = fakeDb();
    const ports = { listOwners: async () => ["u1"], load: async () => data({ settings: { timezone: "Mars/Base" } }), db, stamp: () => "<ts>" };
    const s = await runAutoDebitDaily({ ports, now: NOW, dryRun: false, budget: jobReadBudget(1000), push: null, log: () => undefined });
    expect(s.counts.invalidTimeZone).toBe(1);
    expect(sets).toEqual([]);
  });

  it("queue mode serves only the queued users and clears what it served", async () => {
    const { db } = fakeDb();
    let pending = [
      { uid: "u1", requestedAt: "2026-11-20T10:00:00Z" },
      { uid: "x_duress", requestedAt: "2026-11-20T10:00:00Z" },
    ];
    const done = vi.fn(async (uid: string) => {
      pending = pending.filter((p) => p.uid !== uid);
    });
    const queue: AutoDebitRunQueue = { pending: async () => pending, done };
    const ports = { listOwners: vi.fn(async () => ["someone-else"]), load: vi.fn(async () => data()), db, stamp: () => "<ts>" };
    const s = await runAutoDebitQueue({ queue, ports, now: NOW, dryRun: false, budget: jobReadBudget(1000), push: null, log: () => undefined });
    expect(ports.listOwners).not.toHaveBeenCalled();
    expect(ports.load).toHaveBeenCalledWith("u1");
    expect(s.counts.queueUsers).toBe(1);
    expect(done).toHaveBeenCalledTimes(2);
    expect(pending).toEqual([]);
  });

  it("queue dry run reads once and clears nothing", async () => {
    const { db } = fakeDb();
    const done = vi.fn(async () => undefined);
    const queue: AutoDebitRunQueue = { pending: async () => [{ uid: "u1", requestedAt: "t" }], done };
    const ports = { listOwners: vi.fn(async () => []), load: vi.fn(async () => data()), db, stamp: () => "<ts>" };
    await runAutoDebitQueue({ queue, ports, now: NOW, dryRun: true, budget: jobReadBudget(1000), push: null, log: () => undefined });
    expect(done).not.toHaveBeenCalled();
  });
});
