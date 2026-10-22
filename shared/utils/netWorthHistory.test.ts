import { describe, expect, it } from "vitest";

import {
  MAX_CHART_POINTS,
  downsampleSeries,
  flattenNetWorthHistory,
  hasPointOn,
  historyStartMonth,
  monthsBefore,
  netWorthSnapshotWrite,
  netWorthTrend,
  snapshotBlockers,
  type NetWorthPoint,
  type SnapshotReadiness,
} from "./netWorthHistory";

const ready: SnapshotReadiness = {
  isDuress: false,
  isOnline: true,
  loading: false,
  secondaryLoading: false,
  holdingsMissingQuote: 0,
  liquidBalanceMayBePartial: false,
  totalNetWorth: 100,
  totalAssets: 150,
  totalLiabilities: 50,
};

const pt = (date: string, netWorth: number): NetWorthPoint => ({ date, netWorth, assets: netWorth, liabilities: 0 });

describe("snapshotBlockers", () => {
  it("allows a complete, online, non-duress valuation", () => {
    expect(snapshotBlockers(ready)).toEqual([]);
  });

  it("never records from a partial valuation", () => {
    expect(snapshotBlockers({ ...ready, loading: true })).toContain("loading");
    expect(snapshotBlockers({ ...ready, secondaryLoading: true })).toContain("valuationsLoading");
    expect(snapshotBlockers({ ...ready, holdingsMissingQuote: 2 })).toContain("missingQuotes");
    expect(snapshotBlockers({ ...ready, liquidBalanceMayBePartial: true })).toContain("partialLedger");
  });

  it("blocks offline, duress and impossible values", () => {
    expect(snapshotBlockers({ ...ready, isOnline: false })).toContain("offline");
    expect(snapshotBlockers({ ...ready, isDuress: true })).toContain("duress");
    expect(snapshotBlockers({ ...ready, totalNetWorth: Number.NaN })).toContain("invalidValues");
    expect(snapshotBlockers({ ...ready, totalAssets: 2e12 })).toContain("invalidValues");
  });

  it("treats a negative net worth as valid", () => {
    expect(snapshotBlockers({ ...ready, totalNetWorth: -5000, totalAssets: 0, totalLiabilities: 5000 })).toEqual([]);
  });
});

describe("netWorthSnapshotWrite", () => {
  const base = { todayKey: "2026-10-22", totalNetWorth: 1234.567, totalAssets: 2000.004, totalLiabilities: 765.437, nowMs: 42 };

  it("writes one rounded point under the month and day keys", () => {
    const { monthKey, data } = netWorthSnapshotWrite({ ...base, monthDocExists: false });
    expect(monthKey).toBe("2026-10");
    expect(data).toEqual({
      month: "2026-10",
      points: { "22": { netWorth: 1234.57, assets: 2000, liabilities: 765.44, recordedAtMs: 42 } },
      schemaVersion: 1,
      updatedAtMs: 42,
      createdAtMs: 42,
    });
  });

  it("leaves createdAtMs alone once the month exists", () => {
    const { data } = netWorthSnapshotWrite({ ...base, monthDocExists: true });
    expect(data).not.toHaveProperty("createdAtMs");
  });

  it("rejects a malformed date key", () => {
    expect(() => netWorthSnapshotWrite({ ...base, todayKey: "22/10/2026", monthDocExists: false })).toThrow();
  });
});

describe("dates", () => {
  it("moves back whole months and clamps to shorter months", () => {
    expect(monthsBefore("2026-10-22", 1)).toBe("2026-09-22");
    expect(monthsBefore("2026-03-31", 1)).toBe("2026-02-28");
    expect(monthsBefore("2026-01-15", 3)).toBe("2025-10-15");
  });

  it("reads twelve calendar months ending with this one", () => {
    expect(historyStartMonth("2026-10-22")).toBe("2025-11");
    expect(historyStartMonth("2026-10-22", 1)).toBe("2026-10");
  });
});

describe("flattenNetWorthHistory", () => {
  it("flattens month buckets oldest first and skips malformed entries", () => {
    const points = flattenNetWorthHistory([
      {
        id: "2026-10",
        data: {
          points: {
            "02": { netWorth: 20, assets: 20, liabilities: 0, recordedAtMs: 1 },
            "01": { netWorth: 10, assets: 10, liabilities: 0, recordedAtMs: 1 },
            "32": { netWorth: 99, assets: 99, liabilities: 0, recordedAtMs: 1 },
            "03": { netWorth: Number.NaN, assets: 0, liabilities: 0, recordedAtMs: 1 },
          },
        },
      },
      {
        id: "2026-02",
        data: { points: { "30": { netWorth: 1, assets: 1, liabilities: 0, recordedAtMs: 1 }, "05": { netWorth: 5, assets: 5, liabilities: 0, recordedAtMs: 1 } } },
      },
      { id: "bad", data: { points: { "01": { netWorth: 1, assets: 1, liabilities: 0, recordedAtMs: 1 } } } },
    ]);
    expect(points.map((p) => p.date)).toEqual(["2026-02-05", "2026-10-01", "2026-10-02"]);
    expect(hasPointOn(points, "2026-10-02")).toBe(true);
    expect(hasPointOn(points, "2026-10-03")).toBe(false);
  });
});

describe("netWorthTrend", () => {
  const today = "2026-10-22";

  it("measures from the last day on or before the period start", () => {
    const points = [pt("2026-09-10", 900), pt("2026-09-20", 1000), pt("2026-10-01", 1100), pt("2026-10-22", 1050)];
    const trend = netWorthTrend(points, "1M", today);
    expect(trend.baseline?.date).toBe("2026-09-20");
    expect(trend.latest?.date).toBe("2026-10-22");
    expect(trend.change).toBe(50);
    expect(trend.changePct).toBeCloseTo(5);
    expect(trend.coversFullPeriod).toBe(true);
    expect(trend.series.map((p) => p.date)).toEqual(["2026-09-20", "2026-10-01", "2026-10-22"]);
  });

  it("falls back to the first recorded day with shorter history", () => {
    const trend = netWorthTrend([pt("2026-10-10", 500), pt("2026-10-20", 400)], "3M", today);
    expect(trend.baseline?.date).toBe("2026-10-10");
    expect(trend.change).toBe(-100);
    expect(trend.changePct).toBeCloseTo(-20);
    expect(trend.coversFullPeriod).toBe(false);
  });

  it("has no change with a single day, and no percentage from a zero baseline", () => {
    expect(netWorthTrend([pt("2026-10-20", 400)], "1M", today).change).toBeNull();
    const fromZero = netWorthTrend([pt("2026-10-10", 0), pt("2026-10-20", 400)], "1M", today);
    expect(fromZero.change).toBe(400);
    expect(fromZero.changePct).toBeNull();
  });

  it("uses |baseline| so a shrinking debt reads as a positive change", () => {
    const trend = netWorthTrend([pt("2026-10-01", -1000), pt("2026-10-20", -500)], "1M", today);
    expect(trend.change).toBe(500);
    expect(trend.changePct).toBeCloseTo(50);
  });

  it("ignores points dated after today and keeps gaps as gaps", () => {
    const trend = netWorthTrend([pt("2026-10-01", 1), pt("2026-10-15", 2), pt("2026-11-01", 3)], "1M", today);
    expect(trend.latest?.date).toBe("2026-10-15");
    expect(trend.series).toHaveLength(2);
  });

  it("is empty with no history", () => {
    const trend = netWorthTrend([], "1Y", today);
    expect(trend).toMatchObject({ series: [], baseline: null, latest: null, change: null, changePct: null });
  });
});

describe("downsampleSeries", () => {
  it("keeps short series and thins long ones evenly, keeping both ends", () => {
    expect(downsampleSeries([1, 2, 3], 5)).toEqual([1, 2, 3]);
    const long = Array.from({ length: 365 }, (_, i) => i);
    const thin = downsampleSeries(long, MAX_CHART_POINTS);
    expect(thin).toHaveLength(MAX_CHART_POINTS);
    expect(thin[0]).toBe(0);
    expect(thin[thin.length - 1]).toBe(364);
    expect([...thin].sort((a, b) => a - b)).toEqual(thin);
  });
});
