import { describe, expect, it } from "vitest";

import type { Expense } from "@/shared/types/expense";
import type { DashboardPeriodSummary } from "@/shared/types/financialSummary";
import { calculateDashboardSummaries } from "./reconciliation";
import { spendingBreakdown } from "./dashboardWidgets";
import {
  NO_SUBCATEGORY,
  categoryDetailHref,
  categorySpendSummary,
  categorizedSpendTotal,
  decodeCategoryParam,
  eligibleExpenses,
  filterSortExpenses,
  isFoldedOthersSlice,
  ledgerReconciles,
  monthlySpendSeries,
  resolveSpendingMonth,
  resolveSpendingTab,
  spendComparison,
  spendingInsights,
  spendingOverviewTargetHref,
  totalSpendingHref,
  transactionStats,
  uncategorizedSpend,
  CATEGORY_DETAIL_TABS,
  TOTAL_SPENDING_TABS,
} from "./spendingDrilldown";

let seq = 0;
function expense(partial: Partial<Expense>): Expense {
  seq += 1;
  return {
    id: `e${seq}`,
    amount: 100,
    category: "Food",
    note: "",
    date: "2026-10-05",
    month: "2026-10",
    createdAt: null,
    ...partial,
  };
}

const LEDGER: Expense[] = [
  expense({ amount: 250, category: "Food", subcategory: "Groceries", note: "Weekly shop", date: "2026-10-03" }),
  expense({ amount: 120, category: "Food", subcategory: "Dining", note: "Dinner out", date: "2026-10-12", tags: ["friends"] }),
  expense({ amount: 30, category: "Food", note: "Snack", date: "2026-10-20" }),
  expense({ amount: 900, category: "Home & Household", subcategory: "Rent", date: "2026-10-01" }),
  expense({ amount: 75, category: "Transport", date: "2026-10-09" }),
  // Excluded: soft-deleted, other month, no category.
  expense({ amount: 500, category: "Food", deletedAt: "2026-10-10T00:00:00Z", date: "2026-10-10" }),
  expense({ amount: 60, category: "Food", subcategory: "Groceries", date: "2026-09-28", month: "2026-09" }),
  expense({ amount: 40, category: "", date: "2026-10-15" }),
  // `month` wins over the date prefix, as in the summary.
  expense({ amount: 20, category: "Food", subcategory: "Dining", date: "2026-11-01", month: "2026-10" }),
];

// The summary the dashboard would hold, built by the real rebuild function.
const SUMMARIES = calculateDashboardSummaries(LEDGER, []);
const OCT = SUMMARIES.get("2026-10") as DashboardPeriodSummary;
const SEP = SUMMARIES.get("2026-09") as DashboardPeriodSummary;

describe("route params and hrefs", () => {
  it("encodes the stored category key and the month, never routing by a bare display label", () => {
    const href = categoryDetailHref("Home & Household", "2026-10");
    expect(href).toBe("/spending/Home%20%26%20Household?month=2026-10");
    expect(decodeCategoryParam(href.split("?")[0].replace("/spending/", ""))).toBe("Home & Household");
    expect(categoryDetailHref("A/B", "2026-10", "budget")).toBe("/spending/A%2FB?month=2026-10&tab=budget");
  });

  it("builds Total Spending links with the month and a non-default tab", () => {
    expect(totalSpendingHref("2026-10")).toBe("/spending?month=2026-10");
    expect(totalSpendingHref("2026-10", "categories")).toBe("/spending?month=2026-10&tab=categories");
  });

  it("rejects malformed params", () => {
    expect(decodeCategoryParam(undefined)).toBeNull();
    expect(decodeCategoryParam("%E0%A4%A")).toBeNull();
    expect(decodeCategoryParam("  ")).toBeNull();
    expect(resolveSpendingMonth("2026-13", "2026-10")).toBe("2026-10");
    expect(resolveSpendingMonth(["2026-08"], "2026-10")).toBe("2026-08");
    expect(resolveSpendingTab("budget", CATEGORY_DETAIL_TABS, "overview")).toBe("budget");
    expect(resolveSpendingTab("budget", TOTAL_SPENDING_TABS, "overview")).toBe("overview");
  });
});

describe("Spending Overview navigation", () => {
  it("opens the tapped category's details for that month", () => {
    const { categories } = spendingBreakdown(OCT.categoryTotals, 4);
    const index = categories.findIndex((c) => c.category === "Food");
    expect(isFoldedOthersSlice(categories, index, OCT.categoryTotals, 4)).toBe(false);
    expect(spendingOverviewTargetHref("Food", "2026-10", false)).toBe("/spending/Food?month=2026-10");
  });

  it("sends the folded Others slice to the ranked category list", () => {
    const totals = { A: 50, B: 40, C: 30, D: 20, E: 10, F: 5 };
    const { categories } = spendingBreakdown(totals, 4);
    expect(categories[4].category).toBe("Others");
    expect(isFoldedOthersSlice(categories, 4, totals, 4)).toBe(true);
    expect(spendingOverviewTargetHref("Others", "2026-10", true)).toBe("/spending?month=2026-10&tab=categories");
  });

  it("treats a real category named Others as a category", () => {
    const totals = { Food: 50, Others: 10 };
    const { categories } = spendingBreakdown(totals, 4);
    const index = categories.findIndex((c) => c.category === "Others");
    expect(isFoldedOthersSlice(categories, index, totals, 4)).toBe(false);
  });
});

describe("totals reconcile with the dashboard", () => {
  it("uses the donut's denominator and the category's summary total", () => {
    const donutTotal = spendingBreakdown(OCT.categoryTotals, 4).totalSpent;
    expect(categorizedSpendTotal(OCT.categoryTotals)).toBe(donutTotal);
    const food = categorySpendSummary(OCT.categoryTotals, "Food");
    expect(food.total).toBe(420);
    expect(food.shareOfTotal).toBeCloseTo((420 / donutTotal) * 100, 6);
  });

  it("matches the ledger rows the detail lists, per category and in total", () => {
    const food = eligibleExpenses(LEDGER, "2026-10", "Food");
    expect(transactionStats(food).total).toBe(OCT.categoryTotals.Food);
    expect(ledgerReconciles(transactionStats(food).total, OCT.categoryTotals.Food)).toBe(true);
    const all = eligibleExpenses(LEDGER, "2026-10");
    expect(ledgerReconciles(transactionStats(all).total, categorizedSpendTotal(OCT.categoryTotals))).toBe(true);
    expect(ledgerReconciles(100, 100.5)).toBe(false);
  });

  it("splits a category into subcategories that add back to its total, with no-subcategory spend explicit", () => {
    const food = categorySpendSummary(OCT.categoryTotals, "Food");
    expect(food.subcategories.map((s) => [s.key, s.amount])).toEqual([
      ["Groceries", 250],
      ["Dining", 140],
      [NO_SUBCATEGORY, 30],
    ]);
    expect(food.subcategories.reduce((sum, s) => sum + s.amount, 0)).toBe(food.total);
  });

  it("reports spend with no category instead of dropping it silently", () => {
    expect(uncategorizedSpend(OCT)).toBe(40);
    expect(uncategorizedSpend(SEP)).toBe(0);
    expect(uncategorizedSpend(null)).toBe(0);
  });

  it("returns an empty, zero summary for a category with no spend", () => {
    const none = categorySpendSummary(OCT.categoryTotals, "Travel");
    expect(none).toEqual({ category: "Travel", total: 0, shareOfTotal: 0, subcategories: [] });
    expect(categorySpendSummary(null, "Food").total).toBe(0);
  });
});

describe("transaction inclusion", () => {
  it("keeps only live rows of the period and category, using the summary's month rule", () => {
    const food = eligibleExpenses(LEDGER, "2026-10", "Food");
    expect(food.map((e) => e.amount).sort((a, b) => a - b)).toEqual([20, 30, 120, 250]);
    expect(eligibleExpenses(LEDGER, "2026-09", "Food").map((e) => e.amount)).toEqual([60]);
    expect(eligibleExpenses(LEDGER, "2026-10").some((e) => !e.category)).toBe(false);
    expect(eligibleExpenses(LEDGER, "2026-10").some((e) => e.deletedAt)).toBe(false);
  });

  it("matches a renamed or reassigned row under its current category only", () => {
    const moved = expense({ category: "Transport", subcategory: "Fuel", note: "was Food" });
    expect(eligibleExpenses([moved], "2026-10", "Food")).toEqual([]);
    expect(eligibleExpenses([moved], "2026-10", "Transport")).toEqual([moved]);
  });
});

describe("filterSortExpenses", () => {
  const food = eligibleExpenses(LEDGER, "2026-10", "Food");

  it("searches note, subcategory and tags within the given rows only", () => {
    expect(filterSortExpenses(food, { query: "dinner" }).map((e) => e.amount)).toEqual([120]);
    expect(filterSortExpenses(food, { query: "FRIENDS" }).map((e) => e.amount)).toEqual([120]);
    expect(filterSortExpenses(food, { query: "rent" })).toEqual([]);
  });

  it("filters by subcategory, including rows with none", () => {
    expect(filterSortExpenses(food, { subcategory: "Dining" }).map((e) => e.amount).sort()).toEqual([120, 20]);
    expect(filterSortExpenses(food, { subcategory: NO_SUBCATEGORY }).map((e) => e.amount)).toEqual([30]);
  });

  it("filters by category on Total Spending", () => {
    const all = eligibleExpenses(LEDGER, "2026-10");
    expect(filterSortExpenses(all, { category: "Transport" }).map((e) => e.amount)).toEqual([75]);
  });

  it("sorts by date and amount", () => {
    expect(filterSortExpenses(food, { sort: "newest" }).map((e) => e.date)).toEqual([
      "2026-11-01",
      "2026-10-20",
      "2026-10-12",
      "2026-10-03",
    ]);
    expect(filterSortExpenses(food, { sort: "oldest" })[0].date).toBe("2026-10-03");
    expect(filterSortExpenses(food, { sort: "highest" }).map((e) => e.amount)).toEqual([250, 120, 30, 20]);
    expect(filterSortExpenses(food, { sort: "lowest" }).map((e) => e.amount)).toEqual([20, 30, 120, 250]);
  });

  it("does not mutate its input", () => {
    const before = food.map((e) => e.id);
    filterSortExpenses(food, { sort: "highest" });
    expect(food.map((e) => e.id)).toEqual(before);
  });
});

describe("comparisons and series", () => {
  it("compares only against a real, non-zero previous period", () => {
    expect(spendComparison(120, 100)).toMatchObject({ delta: 20, pct: 20, direction: "up" });
    expect(spendComparison(80, 100)).toMatchObject({ direction: "down", pct: -20 });
    expect(spendComparison(100, 100)?.direction).toBe("flat");
    expect(spendComparison(100, 0)).toBeNull();
    expect(spendComparison(100, null)).toBeNull();
    expect(spendComparison(100, undefined)).toBeNull();
  });

  it("builds an oldest-first window and marks months with no summary", () => {
    const summaries = [...SUMMARIES.values()].map((s) => ({ period: s.period!, categoryTotals: s.categoryTotals! }));
    const series = monthlySpendSeries(summaries, "2026-10", 3);
    expect(series.map((p) => p.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(series.map((p) => p.hasData)).toEqual([false, true, true]);
    expect(series[2].amount).toBe(categorizedSpendTotal(OCT.categoryTotals));
    expect(monthlySpendSeries(summaries, "2026-10", 2, "Food").map((p) => p.amount)).toEqual([60, 420]);
  });
});

describe("spendingInsights", () => {
  const fmt = (n: number) => `₹${n}`;
  const fmtDate = (d: string) => d;
  const point = (month: string, amount: number, hasData = true) => ({ month, amount, hasData });

  it("states insufficient history instead of quoting an average from too few months", () => {
    const { insights, insufficientHistory } = spendingInsights({
      label: "Food",
      series: [point("2026-09", 100), point("2026-10", 150)],
      rows: [],
      formatMoney: fmt,
      formatDate: fmtDate,
    });
    expect(insufficientHistory).toBe(true);
    expect(insights.map((i) => i.id)).toEqual(["vs-previous"]);
    expect(insights[0].title).toBe("50% more than last month");
  });

  it("produces nothing from a missing previous month", () => {
    const { insights } = spendingInsights({
      label: "Food",
      series: [point("2026-09", 0, false), point("2026-10", 150)],
      rows: [],
      formatMoney: fmt,
      formatDate: fmtDate,
    });
    expect(insights).toEqual([]);
  });

  it("adds the average, the leading subcategory and a dominant payment when the data supports them", () => {
    const { insights, insufficientHistory } = spendingInsights({
      label: "Food",
      series: [point("2026-06", 100), point("2026-07", 100), point("2026-08", 100), point("2026-09", 100), point("2026-10", 200)],
      rows: [
        { amount: 150, note: "Party", date: "2026-10-04" },
        { amount: 50, note: "", date: "2026-10-05" },
      ],
      subcategories: [
        { key: "Dining", label: "Dining", amount: 150, percentage: 75 },
        { key: NO_SUBCATEGORY, label: "No subcategory", amount: 50, percentage: 25 },
      ],
      formatMoney: fmt,
      formatDate: fmtDate,
    });
    expect(insufficientHistory).toBe(false);
    expect(insights.map((i) => i.id)).toEqual(["vs-previous", "vs-average", "top-subcategory", "largest"]);
    expect(insights[1].title).toBe("100% above your 4-month average");
    expect(insights[3].body).toBe("Party on 2026-10-04: ₹150.");
  });
});
