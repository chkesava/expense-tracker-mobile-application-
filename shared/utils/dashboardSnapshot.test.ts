import { describe, expect, it } from "vitest";

import type { DashboardPeriodSummary } from "@/shared/types/financialSummary";
import {
  DASHBOARD_SNAPSHOT_MAX_AGE_MS,
  buildDashboardSnapshot,
  readDashboardSnapshot,
  snapshotAgeLabel,
  snapshotNetWorthSummary,
  snapshotPeriodSummaries,
  type SnapshotNetWorth,
} from "@/shared/utils/dashboardSnapshot";
import { snapshotBlockers } from "@/shared/utils/netWorthHistory";

const NOW = Date.UTC(2026, 9, 30, 9, 0, 0);

function summary(period: string, spent: number, income: number): DashboardPeriodSummary {
  return {
    period,
    totalExpenses: spent,
    totalIncome: income,
    categoryTotals: { Food: spent },
    transactionCount: 3,
    summaryVersion: 2,
    calculatedAt: "2026-10-30T08:00:00.000Z",
  };
}

const netWorth: SnapshotNetWorth = {
  liquidBankAssets: 12_000,
  investmentsValue: 0,
  epfValue: 0,
  epfUnreconciledCount: 0,
  stocksHoldingsValue: 0,
  stocksCashBalance: 0,
  totalStocksValue: 0,
  totalAssets: 12_000,
  creditCardLiabilities: 3_000,
  bankOverdraftLiabilities: 0,
  borrowingLiabilities: 0,
  receivableAssets: 0,
  totalLiabilities: 3_000,
  totalNetWorth: 9_000,
  liquidBalanceMayBePartial: false,
  untrustedBalanceAccounts: 0,
  untrustedBalanceAccountNames: [],
  holdingsMissingQuote: 0,
};

const settled = {
  uid: "u1",
  isDuress: false,
  month: "2026-10",
  nowMs: NOW,
  summaries: [summary("2026-09", 400, 900), summary("2026-10", 250, 1000)],
  summariesSettled: true,
  netWorth,
  netWorthSettled: true,
};

const expected = { uid: "u1", isDuress: false, month: "2026-10", nowMs: NOW };

function roundTrip(overrides: Partial<typeof settled> = {}) {
  const built = buildDashboardSnapshot({ ...settled, ...overrides });
  return built ? JSON.stringify(built) : null;
}

describe("buildDashboardSnapshot (SPENDLY-632)", () => {
  it("saves a settled, complete picture", () => {
    const built = buildDashboardSnapshot(settled);
    expect(built?.summaries).toHaveLength(2);
    expect(built?.netWorth.totalNetWorth).toBe(9_000);
  });

  it("saves nothing while anything is loading, in duress or without a user", () => {
    expect(buildDashboardSnapshot({ ...settled, summariesSettled: false })).toBeNull();
    expect(buildDashboardSnapshot({ ...settled, netWorthSettled: false })).toBeNull();
    expect(buildDashboardSnapshot({ ...settled, isDuress: true })).toBeNull();
    expect(buildDashboardSnapshot({ ...settled, uid: null })).toBeNull();
  });

  it("keeps only display fields, not live-object extras", () => {
    const built = buildDashboardSnapshot({
      ...settled,
      netWorth: { ...netWorth, loading: false, secondaryLoading: false } as SnapshotNetWorth,
    });
    expect(built?.netWorth).not.toHaveProperty("loading");
    expect(built?.summaries[0]).not.toHaveProperty("calculatedAt");
  });
});

describe("readDashboardSnapshot (SPENDLY-632)", () => {
  it("round-trips for the same user and month", () => {
    const read = readDashboardSnapshot(roundTrip(), expected);
    expect(read?.netWorth.totalNetWorth).toBe(9_000);
    expect(read?.summaries.map((s) => s.period)).toEqual(["2026-09", "2026-10"]);
  });

  it("is a miss for another user, another month, or a duress session", () => {
    expect(readDashboardSnapshot(roundTrip(), { ...expected, uid: "u2" })).toBeNull();
    expect(readDashboardSnapshot(roundTrip(), { ...expected, month: "2026-11" })).toBeNull();
    expect(readDashboardSnapshot(roundTrip(), { ...expected, isDuress: true })).toBeNull();
  });

  it("is a miss when too old or from the future", () => {
    const old = roundTrip({ nowMs: NOW - DASHBOARD_SNAPSHOT_MAX_AGE_MS - 1 });
    expect(readDashboardSnapshot(old, expected)).toBeNull();
    expect(readDashboardSnapshot(roundTrip({ nowMs: NOW + 60_000 }), expected)).toBeNull();
  });

  it("is a miss for malformed or tampered data", () => {
    expect(readDashboardSnapshot(null, expected)).toBeNull();
    expect(readDashboardSnapshot("not json", expected)).toBeNull();
    const bad = JSON.parse(roundTrip()!);
    bad.netWorth.totalNetWorth = "9000";
    expect(readDashboardSnapshot(JSON.stringify(bad), expected)).toBeNull();
    const badCategory = JSON.parse(roundTrip()!);
    badCategory.summaries[0].categoryTotals.Food = null;
    expect(readDashboardSnapshot(JSON.stringify(badCategory), expected)).toBeNull();
    const wrongVersion = JSON.parse(roundTrip()!);
    wrongVersion.v = 99;
    expect(readDashboardSnapshot(JSON.stringify(wrongVersion), expected)).toBeNull();
  });
});

describe("showing a snapshot (SPENDLY-632)", () => {
  it("restores summaries newest first, like the live listener", () => {
    const read = readDashboardSnapshot(roundTrip(), expected)!;
    expect(snapshotPeriodSummaries(read).map((s) => s.period)).toEqual(["2026-10", "2026-09"]);
  });

  it("saved net worth can never be recorded as today's history point", () => {
    const shown = snapshotNetWorthSummary(netWorth);
    expect(shown.loading).toBe(false);
    expect(
      snapshotBlockers({
        isDuress: false,
        isOnline: true,
        loading: shown.loading,
        secondaryLoading: shown.secondaryLoading,
        untrustedBalanceAccounts: shown.untrustedBalanceAccounts,
        totalNetWorth: shown.totalNetWorth,
        totalAssets: shown.totalAssets,
        totalLiabilities: shown.totalLiabilities,
      })
    ).toContain("valuationsLoading");
  });

  it("labels the age of the saved figures", () => {
    expect(snapshotAgeLabel(NOW, NOW + 20_000)).toBe("just now");
    expect(snapshotAgeLabel(NOW, NOW + 12 * 60_000)).toBe("12 min ago");
    expect(snapshotAgeLabel(NOW, NOW + 3 * 3_600_000)).toBe("3 h ago");
    expect(snapshotAgeLabel(NOW, NOW + 26 * 3_600_000)).toBe("1 day ago");
    expect(snapshotAgeLabel(NOW, NOW + 50 * 3_600_000)).toBe("2 days ago");
  });
});
