import { describe, expect, it } from "vitest";

import type { AccountActivity } from "@/shared/types/expense";
import { enrichAccountActivities } from "./accountActivityFilters";
import {
  balanceTrendStartDate,
  buildAccountBalanceTrend,
  downsampleBalanceTrend,
  type BalanceTrendPoint,
} from "./accountBalanceTrend";

const TODAY = "2026-09-30";

function build(activities: AccountActivity[]) {
  return enrichAccountActivities(activities, [], [], []);
}

function row(
  id: string,
  date: string,
  amount: number,
  runningBalance?: number,
  time?: string
): AccountActivity {
  return {
    id,
    date,
    amount,
    type: "debit",
    linkedExpenseId: id,
    category: "Food & Groceries",
    runningBalance,
    time,
  };
}

describe("account balance trend", () => {
  describe("balanceTrendStartDate", () => {
    it("covers 30 inclusive days", () => {
      expect(balanceTrendStartDate("30d", TODAY)).toBe("2026-09-01");
    });

    it("steps back whole months", () => {
      expect(balanceTrendStartDate("3m", TODAY)).toBe("2026-06-30");
      expect(balanceTrendStartDate("6m", TODAY)).toBe("2026-03-30");
      expect(balanceTrendStartDate("1y", TODAY)).toBe("2025-09-30");
    });

    it("clamps to the last day of a shorter month", () => {
      // 31 March minus one month is 28 February, not 31 February.
      expect(balanceTrendStartDate("1y", "2026-03-31")).toBe("2025-03-31");
      expect(balanceTrendStartDate("3m", "2026-05-31")).toBe("2026-02-28");
      expect(balanceTrendStartDate("3m", "2024-05-31")).toBe("2024-02-29");
    });
  });

  describe("daily series", () => {
    it("carries the balance forward on days with no activity", () => {
      const trend = buildAccountBalanceTrend(
        build([
          row("c", "2026-09-30", 100, 700),
          row("b", "2026-09-28", 200, 800),
          row("a", "2026-09-26", 300, 1_000),
        ]),
        "30d",
        { today: TODAY }
      );
      const byDate = new Map(trend.points.map((p) => [p.date, p.balance]));
      expect(byDate.get("2026-09-26")).toBe(1_000);
      // Carried, not invented: the balance really was 1,000 on the 27th.
      expect(byDate.get("2026-09-27")).toBe(1_000);
      expect(byDate.get("2026-09-28")).toBe(800);
      expect(byDate.get("2026-09-29")).toBe(800);
      expect(byDate.get("2026-09-30")).toBe(700);
    });

    it("marks which days actually had activity", () => {
      const trend = buildAccountBalanceTrend(
        build([row("a", "2026-09-26", 300, 1_000)]),
        "30d",
        { today: TODAY }
      );
      const active = trend.points.filter((p) => p.hasActivity);
      expect(active.map((p) => p.date)).toEqual(["2026-09-26"]);
    });

    it("uses the last posting of a day as that day's closing balance", () => {
      const trend = buildAccountBalanceTrend(
        build([
          row("evening", "2026-09-28", 200, 800, "08:30 PM"),
          row("morning", "2026-09-28", 100, 900, "09:15 AM"),
        ]),
        "30d",
        { today: TODAY }
      );
      const day = trend.points.find((p) => p.date === "2026-09-28");
      expect(day?.balance).toBe(800);
    });

    it("runs to today even when the last activity is older", () => {
      const trend = buildAccountBalanceTrend(
        build([row("a", "2026-09-10", 300, 1_000)]),
        "30d",
        { today: TODAY }
      );
      expect(trend.points[trend.points.length - 1]).toEqual({
        date: "2026-09-30",
        balance: 1_000,
        hasActivity: false,
      });
    });
  });

  describe("not inventing data", () => {
    it("starts the series only once a balance is known", () => {
      const trend = buildAccountBalanceTrend(
        build([row("first", "2026-09-20", 300, 1_000)]),
        "30d",
        { today: TODAY }
      );
      // The window opens on 1 Sep, but nothing is known until the 20th.
      expect(trend.startDate).toBe("2026-09-01");
      expect(trend.points[0].date).toBe("2026-09-20");
    });

    it("ignores rows from before the balance baseline", () => {
      const trend = buildAccountBalanceTrend(
        build([
          row("known", "2026-09-20", 300, 1_000),
          row("pre-baseline", "2026-09-05", 500),
        ]),
        "30d",
        { today: TODAY }
      );
      expect(trend.points[0].date).toBe("2026-09-20");
      expect(trend.points.every((p) => p.balance !== undefined)).toBe(true);
    });

    it("reports nothing available when no balance is known at all", () => {
      const trend = buildAccountBalanceTrend(
        build([row("pre-baseline", "2026-09-05", 500)]),
        "30d",
        { today: TODAY }
      );
      expect(trend.available).toBe(false);
      expect(trend.points).toEqual([]);
      expect(trend.current).toBeUndefined();
    });

    it("reports nothing available for an account with no activity", () => {
      const trend = buildAccountBalanceTrend([], "30d", { today: TODAY });
      expect(trend.available).toBe(false);
      expect(trend.points).toEqual([]);
    });
  });

  describe("opening balance", () => {
    it("carries in the balance from before the window", () => {
      const trend = buildAccountBalanceTrend(
        build([
          row("inside", "2026-09-10", 200, 800),
          row("before", "2026-08-20", 300, 1_000),
        ]),
        "30d",
        { today: TODAY }
      );
      // The window opens on 1 Sep already holding August's closing balance.
      expect(trend.points[0]).toEqual({
        date: "2026-09-01",
        balance: 1_000,
        hasActivity: false,
      });
      expect(trend.opening).toEqual({ date: "2026-09-01", balance: 1_000 });
    });
  });

  describe("markers", () => {
    const trend = buildAccountBalanceTrend(
      build([
        row("d", "2026-09-28", 100, 500),
        row("c", "2026-09-20", 100, 2_000),
        row("b", "2026-09-10", 100, 300),
        row("a", "2026-09-02", 100, 1_000),
      ]),
      "30d",
      { today: TODAY }
    );

    it("reports opening, current, highest and lowest with dates", () => {
      expect(trend.opening).toEqual({ date: "2026-09-02", balance: 1_000 });
      expect(trend.current).toEqual({ date: "2026-09-30", balance: 500 });
      expect(trend.highest).toEqual({ date: "2026-09-20", balance: 2_000 });
      expect(trend.lowest).toEqual({ date: "2026-09-10", balance: 300 });
    });
  });

  describe("negative balances", () => {
    it("charts an overdrawn account without clamping at zero", () => {
      const trend = buildAccountBalanceTrend(
        build([
          row("recover", "2026-09-25", 100, 400),
          row("overdrawn", "2026-09-15", 100, -1_200),
          row("start", "2026-09-05", 100, 600),
        ]),
        "30d",
        { today: TODAY }
      );
      expect(trend.lowest).toEqual({ date: "2026-09-15", balance: -1_200 });
      expect(trend.highest).toEqual({ date: "2026-09-05", balance: 600 });
      const overdrawnDays = trend.points.filter((p) => p.balance < 0);
      expect(overdrawnDays.length).toBe(10);
    });
  });

  describe("credit cards", () => {
    it("charts nothing, because an outstanding is not a balance", () => {
      const trend = buildAccountBalanceTrend(
        build([row("a", "2026-09-10", 300, 1_000)]),
        "30d",
        { today: TODAY, supportsRunningBalance: false }
      );
      expect(trend.available).toBe(false);
      expect(trend.points).toEqual([]);
      expect(trend.highest).toBeUndefined();
    });
  });

  describe("date boundaries", () => {
    it("excludes the day before the window opens", () => {
      const trend = buildAccountBalanceTrend(
        build([row("edge", "2026-08-31", 100, 900)]),
        "30d",
        { today: TODAY }
      );
      expect(trend.startDate).toBe("2026-09-01");
      // It still sets the opening balance carried into the window.
      expect(trend.points[0]).toEqual({
        date: "2026-09-01",
        balance: 900,
        hasActivity: false,
      });
    });

    it("ignores rows dated after today", () => {
      const trend = buildAccountBalanceTrend(
        build([
          row("future", "2026-10-05", 100, 1),
          row("real", "2026-09-20", 100, 750),
        ]),
        "30d",
        { today: TODAY }
      );
      expect(trend.current).toEqual({ date: "2026-09-30", balance: 750 });
      expect(trend.points.some((p) => p.date > TODAY)).toBe(false);
    });

    it("produces one point per day across a year", () => {
      const trend = buildAccountBalanceTrend(
        build([row("a", "2025-09-30", 100, 5_000)]),
        "1y",
        { today: TODAY }
      );
      // 30 Sep 2025 to 30 Sep 2026 inclusive.
      expect(trend.points).toHaveLength(366);
      expect(trend.points[0].date).toBe("2025-09-30");
      expect(trend.points[365].date).toBe(TODAY);
    });
  });

  describe("downsampleBalanceTrend", () => {
    const long: BalanceTrendPoint[] = Array.from({ length: 400 }, (_, i) => ({
      date: `day-${i}`,
      balance: i === 300 ? 9_999 : i === 120 ? -5_000 : i,
      hasActivity: false,
    }));

    it("leaves a short series untouched", () => {
      const short = long.slice(0, 10);
      expect(downsampleBalanceTrend(short, 50)).toBe(short);
    });

    it("thins a long series", () => {
      const thinned = downsampleBalanceTrend(long, 100);
      expect(thinned.length).toBeLessThanOrEqual(104);
      expect(thinned.length).toBeGreaterThan(90);
    });

    it("always keeps the ends and the extremes", () => {
      const thinned = downsampleBalanceTrend(long, 100);
      expect(thinned[0]).toBe(long[0]);
      expect(thinned[thinned.length - 1]).toBe(long[399]);
      expect(thinned).toContain(long[300]);
      expect(thinned).toContain(long[120]);
    });

    it("keeps the series in chronological order", () => {
      const thinned = downsampleBalanceTrend(long, 100);
      const indexes = thinned.map((point) => Number(point.date.split("-")[1]));
      expect([...indexes].sort((a, b) => a - b)).toEqual(indexes);
    });
  });
});
