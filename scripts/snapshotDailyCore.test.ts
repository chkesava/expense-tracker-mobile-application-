import { describe, expect, it, vi } from "vitest";

import type { Holding } from "../shared/features/portfolio/types";
import { jobReadBudget, type JobDb } from "./lib/dailyJobCore";
import { computeSnapshots, runSnapshotDaily, type SnapshotDailyPorts, type SnapshotUserData } from "./lib/snapshotDailyCore";

const NOW = new Date("2026-11-09T03:00:00.000Z"); // 08:30 IST, 9 Nov

const bank = { id: "bank", name: "HDFC", typeId: "t-bank", currentBalance: 50000, balanceInitialized: true } as never;
const card = { id: "card", name: "Roar", typeId: "t-card", currentOutstanding: 5000, balanceInitialized: true } as never;
const holding = { id: "h1", symbol: "INFY", yahooSymbol: "INFY.NS", instrumentType: "stock", quantity: 10, averageBuyPrice: 1000 } as unknown as Holding;

function data(over: Partial<SnapshotUserData> = {}): SnapshotUserData {
  return {
    timezone: "Asia/Kolkata",
    accounts: [bank, card],
    accountTypes: [{ id: "t-bank", name: "Bank" }, { id: "t-card", name: "Credit Card" }] as never,
    investments: [],
    holdings: [holding],
    cashEntries: [],
    portfolioSettings: { onboardingComplete: true, cashBalance: 2000 },
    borrowings: [],
    borrowingRepayments: [],
    receivables: [],
    receivableRepayments: [],
    groupFunds: [],
    epfBalance: 100000,
    ...over,
  };
}

function harness(over: Partial<SnapshotDailyPorts> = {}, user = data()) {
  const writes: Array<{ op: string; path: string; data: Record<string, unknown> }> = [];
  const db: JobDb = {
    doc: (path) => ({ path }),
    batch: () => ({
      create: (ref, d) => writes.push({ op: "create", path: ref.path, data: d }),
      set: (ref, d) => writes.push({ op: "set", path: ref.path, data: d }),
      update: () => undefined,
      commit: async () => undefined,
    }),
  };
  const price = vi.fn(async () => 1500);
  const ports: SnapshotDailyPorts = {
    listOwners: async () => ["u1"],
    load: async () => user,
    recordedDays: async () => null,
    portfolioSnapshotExists: async () => false,
    price,
    db,
    stamp: () => "<ts>",
    nowMs: () => 1_000,
    ...over,
  };
  const run = (dryRun = false) => runSnapshotDaily({ ports, now: NOW, dryRun, budget: jobReadBudget(1000), push: null, log: () => undefined });
  return { writes, run, price };
}

describe("snapshot-daily (SPENDLY-741): the app's daily points, on the server", () => {
  it("computes the app's net worth: bank + holdings at today's price + cash + EPF − card", () => {
    const { totals, blockers, portfolio } = computeSnapshots(data(), new Map([["INFY.NS", 1500]]), "2026-11-09");
    expect(totals.totalNetWorth).toBe(50000 + 10 * 1500 + 2000 + 100000 - 5000);
    expect(blockers).toEqual([]);
    expect(portfolio.portfolioValue).toBe(15000);
    expect(portfolio.totalInvested).toBe(10000);
  });

  it("a holding without a price is valued at cost, as the app's headline does", () => {
    const { totals } = computeSnapshots(data(), new Map(), "2026-11-09");
    expect(totals.stocksHoldingsValue).toBe(10 * 1000);
  });

  it("records today's point (with createdAtMs for a new month) and the portfolio snapshot", async () => {
    const h = harness();
    const s = await h.run();
    const point = h.writes.find((w) => w.path === "users/u1/netWorthHistory/2026-11");
    expect(point?.data).toMatchObject({ month: "2026-11", points: { "09": { netWorth: 162000, recordedAtMs: 1000 } }, createdAtMs: 1000 });
    const snap = h.writes.find((w) => w.path === "users/u1/portfolioSnapshots/2026-11-09");
    expect(snap?.op).toBe("create");
    expect(snap?.data).toMatchObject({ portfolioValue: 15000, investedValue: 10000, profit: 5000, netWorth: 17000, date: "2026-11-09" });
    expect(s.counts).toMatchObject({ netWorthRecorded: 1, portfolioRecorded: 1 });
  });

  it("a day already recorded and today's snapshot present: nothing is read for prices, nothing written", async () => {
    const h = harness({ recordedDays: async () => ["08", "09"], portfolioSnapshotExists: async () => true });
    const s = await h.run();
    expect(h.writes).toEqual([]);
    expect(h.price).not.toHaveBeenCalled();
    expect(s.counts.alreadyRecorded).toBe(1);
  });

  it("an untrusted balance blocks the net-worth point (as the app does) but not the portfolio snapshot", async () => {
    const untrusted = { ...(bank as object), balanceReconciliationStatus: "needs_reconciliation" } as never;
    const h = harness({}, data({ accounts: [untrusted, card] }));
    const s = await h.run();
    expect(h.writes.some((w) => w.path.includes("netWorthHistory"))).toBe(false);
    expect(h.writes.some((w) => w.path.includes("portfolioSnapshots"))).toBe(true);
    expect(s.counts.netWorthBlocked_untrustedBalances).toBe(1);
  });

  it("no portfolio onboarding: no portfolio snapshot; dry run writes nothing; duress skipped", async () => {
    const h = harness({}, data({ portfolioSettings: null }));
    await h.run(true);
    expect(h.writes).toEqual([]);
    const d = harness({ listOwners: async () => ["u1_duress"] });
    expect((await d.run()).duressSkipped).toBe(1);
  });
});
