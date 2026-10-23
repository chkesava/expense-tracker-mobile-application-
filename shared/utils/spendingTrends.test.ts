import { describe, expect, it } from "vitest";

import type { Expense } from "@/shared/types/expense";
import type { DashboardPeriodSummary } from "@/shared/types/financialSummary";
import { calculateDashboardSummaries } from "./reconciliation";
import { categorizedSpendTotal } from "./spendingDrilldown";
import {
  categoryMovements,
  dailySeries,
  monthlyTrend,
  seriesStats,
  summaryWindowFor,
  trendInsights,
  trendsHref,
  weeklySeries,
  yearlyTrend,
} from "./spendingTrends";

let seq = 0;
const exp = (p: Partial<Expense>): Expense => {
  seq += 1;
  return { id: `e${seq}`, amount: 100, category: "Food", note: "", date: "2026-10-01", month: "2026-10", createdAt: null, ...p };
};

const OCT = [
  exp({ amount: 300, date: "2026-10-01" }),
  exp({ amount: 200, date: "2026-10-05", category: "Transport" }),
  exp({ amount: 500, date: "2026-10-12" }),
  exp({ amount: 50, date: "2026-10-12", category: "Shopping" }),
  // Excluded: deleted, no category, other month.
  exp({ amount: 999, date: "2026-10-03", deletedAt: "2026-10-04T00:00:00Z" }),
  exp({ amount: 40, date: "2026-10-03", category: "" }),
  exp({ amount: 70, date: "2026-09-30", month: "2026-09" }),
  // Counted in October by its month field, though dated in November.
  exp({ amount: 25, date: "2026-11-01", month: "2026-10" }),
];

const summaryOf = (rows: Expense[]) =>
  [...calculateDashboardSummaries(rows, []).values()].map((s) => ({ period: s.period!, categoryTotals: s.categoryTotals! }));

describe("daily and weekly points reconcile with the month's summary", () => {
  it("adds every eligible row once, matching the donut total", () => {
    const days = dailySeries(OCT, "2026-10", "2026-10-23");
    const sum = Math.round(days.reduce((s, d) => s + d.amount, 0) * 100) / 100;
    const oct = summaryOf(OCT).find((s) => s.period === "2026-10")!;
    expect(sum).toBe(categorizedSpendTotal(oct.categoryTotals));
    expect(sum).toBe(1075);
    expect(days).toHaveLength(31);
    expect(days[11]).toMatchObject({ key: "2026-10-12", amount: 550, detailLabel: "12 Oct", label: "" });
    expect(days[4].label).toBe("5");
    // A row dated outside the month but filed in it lands on the last day.
    expect(days[30].amount).toBe(25);
  });

  it("has no data for days that have not happened yet", () => {
    const days = dailySeries(OCT, "2026-10", "2026-10-23");
    expect(days[22].hasData).toBe(true);
    expect(days[23].hasData).toBe(false);
  });

  it("splits weeks on the chosen first day, clipped to the month", () => {
    // 1 Oct 2026 is a Thursday.
    const mon = weeklySeries(OCT, "2026-10", "monday", "2026-10-31");
    expect(mon.map((w) => w.label)).toEqual(["1–4", "5–11", "12–18", "19–25", "26–31"]);
    expect(mon.map((w) => w.amount)).toEqual([300, 200, 550, 0, 25]);
    const sun = weeklySeries(OCT, "2026-10", "sunday", "2026-10-31");
    expect(sun[0].label).toBe("1–3");
    expect(sun.reduce((s, w) => s + w.amount, 0)).toBe(1075);
  });
});

describe("monthly and yearly points come from the summaries", () => {
  const summaries: Array<Pick<DashboardPeriodSummary, "period" | "categoryTotals">> = [
    { period: "2024-12", categoryTotals: { Food: 100 } },
    { period: "2025-06", categoryTotals: { Food: 200, "Food::Groceries": 150 } },
    { period: "2025-11", categoryTotals: { Food: 300 } },
    { period: "2026-09", categoryTotals: { Food: 400 } },
    { period: "2026-10", categoryTotals: { Food: 500, Transport: 100 } },
  ];

  it("months use the parent totals and mark missing months", () => {
    const months = monthlyTrend(summaries, "2026-10", 3);
    expect(months.map((m) => [m.key, m.amount, m.hasData])).toEqual([
      ["2026-08", 0, false],
      ["2026-09", 400, true],
      ["2026-10", 600, true],
    ]);
    expect(months[2].detailLabel).toBe("Oct 2026");
  });

  it("years sum their months, the current one only to the selected month", () => {
    const years = yearlyTrend(summaries, "2026-10", 3);
    expect(years.map((y) => [y.key, y.amount, y.hasData])).toEqual([
      ["2024", 100, true],
      ["2025", 500, true],
      ["2026", 1000, true],
    ]);
    expect(years[2].detailLabel).toBe("2026 (Jan–Oct)");
    expect(yearlyTrend(summaries, "2026-10", 4)[0]).toMatchObject({ key: "2023", hasData: false });
  });

  it("listens to a bounded window", () => {
    expect(summaryWindowFor("monthly")).toBe(13);
    expect(summaryWindowFor("yearly")).toBe(36);
  });
});

describe("seriesStats", () => {
  const pt = (key: string, amount: number, hasData = true) => ({ key, label: key, detailLabel: key, amount, hasData });

  it("averages, ranks and compares only points with data", () => {
    const stats = seriesStats([pt("a", 0, false), pt("b", 100), pt("c", 300), pt("d", 200)]);
    expect(stats.average).toBe(200);
    expect(stats.highest?.key).toBe("c");
    expect(stats.lowest?.key).toBe("b");
    expect(stats.change).toMatchObject({ pct: (-100 / 300) * 100, direction: "down", from: { key: "c" }, to: { key: "d" } });
  });

  it("gives no comparison from a zero or missing base, and nothing for no data", () => {
    expect(seriesStats([pt("a", 0), pt("b", 50)]).change).toBeNull();
    expect(seriesStats([pt("a", 50)]).change).toBeNull();
    expect(seriesStats([pt("a", 0, false)])).toMatchObject({ average: null, highest: null, pointsWithData: 0 });
  });
});

describe("categoryMovements", () => {
  it("compares each category with last month and keeps ones that dropped to zero", () => {
    const moves = categoryMovements({ Food: 600, Transport: 100, "Food::Groceries": 400 }, { Food: 400, Shopping: 80 });
    expect(moves.map((m) => [m.category, m.amount, m.previous, m.delta, m.pct === null ? null : Math.round(m.pct)])).toEqual([
      ["Food", 600, 400, 200, 50],
      ["Transport", 100, 0, 100, null],
      ["Shopping", 0, 80, -80, -100],
    ]);
  });
});

describe("trendInsights", () => {
  const fmt = (n: number) => `₹${Math.round(n)}`;

  it("states insufficient history instead of inventing averages or moves", () => {
    const result = trendInsights({ summaries: [{ period: "2026-10", categoryTotals: { Food: 500 } }], month: "2026-10", formatMoney: fmt });
    expect(result.insights).toEqual([]);
    expect(result.insufficientHistory).toBe(true);
  });

  it("names month-over-month, the average and material category moves", () => {
    const summaries = [
      { period: "2026-06", categoryTotals: { Food: 400, Transport: 100 } },
      { period: "2026-07", categoryTotals: { Food: 400, Transport: 100 } },
      { period: "2026-08", categoryTotals: { Food: 400, Transport: 100 } },
      { period: "2026-09", categoryTotals: { Food: 400, Transport: 100 } },
      { period: "2026-10", categoryTotals: { Food: 700, Transport: 50 } },
    ];
    const { insights, insufficientHistory } = trendInsights({ summaries, month: "2026-10", formatMoney: fmt });
    expect(insufficientHistory).toBe(false);
    expect(insights.map((i) => i.id)).toEqual(["mom", "avg", "up-Food", "down-Transport"]);
    expect(insights[0].title).toBe("50% more than last month");
    expect(insights[2].title).toBe("Food rose 75%");
  });

  it("names the highest week only with two weeks of spending", () => {
    const weeks = weeklySeries(OCT, "2026-10", "monday", "2026-10-31");
    const { insights } = trendInsights({ summaries: summaryOf(OCT), month: "2026-10", weeks, formatMoney: fmt });
    expect(insights.find((i) => i.id === "top-week")?.title).toBe("Highest week: 12–18 Oct");
  });
});

describe("trendsHref", () => {
  it("keeps the month and non-default granularity and tab", () => {
    expect(trendsHref("2026-10")).toBe("/trends?month=2026-10");
    expect(trendsHref("2026-10", { granularity: "weekly", tab: "insights" })).toBe("/trends?month=2026-10&gran=weekly&tab=insights");
  });
});
