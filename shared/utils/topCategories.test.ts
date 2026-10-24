import { describe, expect, it } from "vitest";

import type { Expense } from "@/shared/types/expense";
import { spendingBreakdown } from "./dashboardWidgets";
import { calculateDashboardSummaries } from "./reconciliation";
import {
  categoryMonthForPeriod,
  periodCategoryTotals,
  periodMonths,
  previousPeriodMonths,
  rankCategories,
  topCategoriesHref,
  topCategoriesWindow,
  topCategoryInsights,
} from "./topCategories";

describe("period boundaries", () => {
  it("anchors every period on the selected month", () => {
    expect(periodMonths("this_month", "2026-10")).toEqual(["2026-10"]);
    expect(periodMonths("last_month", "2026-01")).toEqual(["2025-12"]);
    expect(periodMonths("last_3_months", "2026-02")).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(periodMonths("this_year", "2026-03")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("compares with the span right before, or the same months last year", () => {
    expect(previousPeriodMonths("this_month", "2026-10")).toEqual(["2026-09"]);
    expect(previousPeriodMonths("last_month", "2026-10")).toEqual(["2026-08"]);
    expect(previousPeriodMonths("last_3_months", "2026-10")).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(previousPeriodMonths("this_year", "2026-03")).toEqual(["2025-01", "2025-02", "2025-03"]);
  });

  it("listens to a bounded window that covers both", () => {
    expect(topCategoriesWindow("this_month", "2026-10")).toBe(2);
    expect(topCategoriesWindow("last_3_months", "2026-10")).toBe(6);
    expect(topCategoriesWindow("this_year", "2026-10")).toBe(22);
    expect(topCategoriesWindow("this_year", "2026-01")).toBe(13);
  });

  it("opens a category on the month the period points at", () => {
    expect(categoryMonthForPeriod("last_month", "2026-10")).toBe("2026-09");
    expect(categoryMonthForPeriod("this_year", "2026-10")).toBe("2026-10");
  });
});

let seq = 0;
const exp = (p: Partial<Expense>): Expense => {
  seq += 1;
  return { id: `e${seq}`, amount: 100, category: "Food", note: "", date: "2026-10-05", month: "2026-10", createdAt: null, ...p };
};

const LEDGER = [
  exp({ amount: 600, category: "Food", subcategory: "Groceries" }),
  exp({ amount: 300, category: "Home" }),
  exp({ amount: 100, category: "Transport" }),
  exp({ amount: 40, category: "" }), // no category: not in any category or the donut
  exp({ amount: 999, category: "Food", deletedAt: "2026-10-06T00:00:00Z" }),
  exp({ amount: 250, category: "Food", date: "2026-09-10", month: "2026-09" }),
  exp({ amount: 500, category: "Home", date: "2026-08-10", month: "2026-08" }),
];
const SUMMARIES = [...calculateDashboardSummaries(LEDGER, []).values()].map((s) => ({ period: s.period!, categoryTotals: s.categoryTotals! }));

describe("ranking reconciles with the dashboard donut", () => {
  it("one month equals the donut's categories and total", () => {
    const totals = periodCategoryTotals(SUMMARIES, ["2026-10"]);
    const { ranked, total } = rankCategories(totals.categoryTotals);
    const donut = spendingBreakdown(totals.categoryTotals, Number.MAX_SAFE_INTEGER);
    expect(total).toBe(donut.totalSpent);
    expect(total).toBe(1000);
    expect(ranked.map((r) => [r.rank, r.category, r.amount])).toEqual([
      [1, "Food", 600],
      [2, "Home", 300],
      [3, "Transport", 100],
    ]);
    expect(ranked[0].percentage).toBe(60);
  });

  it("sums several months and names the ones with no summary", () => {
    const totals = periodCategoryTotals(SUMMARIES, ["2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(totals.missingMonths).toEqual(["2026-07"]);
    const { ranked, total } = rankCategories(totals.categoryTotals);
    expect(total).toBe(1750);
    expect(ranked.map((r) => r.category)).toEqual(["Food", "Home", "Transport"]);
    expect(ranked.find((r) => r.category === "Home")!.amount).toBe(800);
    expect(totals.categoryTotals["Food::Groceries"]).toBe(600);
  });

  it("is empty for a period with nothing recorded", () => {
    expect(rankCategories(periodCategoryTotals(SUMMARIES, ["2025-01"]).categoryTotals)).toEqual({ ranked: [], total: 0 });
  });
});

describe("topCategoryInsights", () => {
  const fmt = (n: number) => `₹${Math.round(n)}`;

  it("names the fewest categories making up half of spending", () => {
    const current = periodCategoryTotals(SUMMARIES, ["2026-10"]);
    const { insights } = topCategoryInsights({ current, previous: periodCategoryTotals(SUMMARIES, ["2026-09"]), periodLabel: "This month", formatMoney: fmt });
    expect(insights[0]).toMatchObject({ id: "concentration", title: "Food is 60% of spending" });
  });

  it("names a mover only when the previous period is complete", () => {
    const current = periodCategoryTotals(SUMMARIES, ["2026-10"]);
    const complete = topCategoryInsights({ current, previous: periodCategoryTotals(SUMMARIES, ["2026-09"]), periodLabel: "This month", formatMoney: fmt });
    expect(complete.comparable).toBe(true);
    expect(complete.insights.map((i) => i.id)).toEqual(["concentration", "move-Food"]);
    expect(complete.insights[1].title).toBe("Food rose 140%");
    const gap = topCategoryInsights({ current, previous: periodCategoryTotals(SUMMARIES, ["2026-06"]), periodLabel: "This month", formatMoney: fmt });
    expect(gap.comparable).toBe(false);
    expect(gap.insights.map((i) => i.id)).toEqual(["concentration"]);
  });
});

describe("topCategoriesHref", () => {
  it("carries the month and a non-default period", () => {
    expect(topCategoriesHref("2026-10")).toBe("/top-categories?month=2026-10");
    expect(topCategoriesHref("2026-10", "this_year")).toBe("/top-categories?month=2026-10&period=this_year");
  });
});
