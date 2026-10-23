import { describe, expect, it } from "vitest";

import type { Expense } from "@/shared/types/expense";
import {
  budgetDayOfMonth,
  budgetDetailHref,
  budgetDetailInsights,
  budgetLabel,
  budgetOverviewInsights,
  budgetStatusCounts,
  budgetStatusOf,
  budgetUsedPct,
  budgetsHref,
  categoryBudgetRollup,
  findBudget,
  monthlyBudgetHistory,
  rollupStatus,
  sortBudgetItems,
  unbudgetedSpending,
} from "./budgetDrilldown";
import { computeActiveCategoryBudgets } from "./dashboardWidgets";
import { calculateDashboardSummaries } from "./reconciliation";
import { computeSpendlyBudget } from "./spendlyBudget";
import { decodeCategoryParam, eligibleExpenses, transactionStats } from "./spendingDrilldown";

let seq = 0;
function expense(partial: Partial<Expense>): Expense {
  seq += 1;
  return { id: `e${seq}`, amount: 100, category: "Food", note: "", date: "2026-10-05", month: "2026-10", createdAt: null, ...partial };
}

const LEDGER: Expense[] = [
  expense({ amount: 600, category: "Food", subcategory: "Groceries" }),
  expense({ amount: 300, category: "Food", subcategory: "Dining" }),
  expense({ amount: 100, category: "Food" }),
  expense({ amount: 450, category: "Shopping", subcategory: "Clothes" }),
  expense({ amount: 2000, category: "Home", subcategory: "Rent" }),
  expense({ amount: 80, category: "Transport" }),
  // Excluded by the summary rule: deleted, and another month.
  expense({ amount: 999, category: "Food", subcategory: "Groceries", deletedAt: "2026-10-06T00:00:00Z" }),
  expense({ amount: 400, category: "Food", subcategory: "Groceries", date: "2026-09-10", month: "2026-09" }),
];
const SUMMARIES = calculateDashboardSummaries(LEDGER, []);
const OCT = SUMMARIES.get("2026-10")!.categoryTotals!;
const SEP = SUMMARIES.get("2026-09")!.categoryTotals!;

const BUDGETS = [
  { id: "b-food", category: "Food", amount: 1000, month: "2026-10" }, // 100% used → close to limit
  { id: "b-groc", category: "Food", subcategory: "Groceries", amount: 500, month: "2026-10" }, // over
  { id: "b-shop", category: "Shopping", amount: 1000, month: "2026-10" }, // 45% on track
  { id: "b-rent", category: "Home", subcategory: "Rent", amount: 1800, month: "2026-10" }, // orphan sub budget, over
  { id: "b-food-sep", category: "Food", amount: 500, month: "2026-09" },
];
const ITEMS = computeActiveCategoryBudgets(BUDGETS, OCT, "2026-10");
const byId = (id: string) => ITEMS.find((b) => b.id === id)!;

describe("status rules come from computeActiveCategoryBudgets", () => {
  it("maps its flags without a threshold of its own", () => {
    expect(budgetStatusOf(byId("b-groc"))).toBe("over");
    expect(budgetStatusOf(byId("b-food"))).toBe("atRisk");
    expect(budgetStatusOf(byId("b-shop"))).toBe("onTrack");
    expect(budgetStatusOf({ isOver: false, isWarning: false })).toBe("onTrack");
  });

  it("counts statuses for the selected month only", () => {
    expect(budgetStatusCounts(ITEMS)).toEqual({ onTrack: 1, atRisk: 1, over: 2, total: 4 });
    // September: Food 400 of 500 is exactly 80%, the warning line.
    expect(budgetStatusCounts(computeActiveCategoryBudgets(BUDGETS, SEP, "2026-09"))).toEqual({
      onTrack: 0,
      atRisk: 1,
      over: 0,
      total: 1,
    });
    expect(budgetStatusCounts([])).toEqual({ onTrack: 0, atRisk: 0, over: 0, total: 0 });
  });

  it("shows usage beyond 100% where the stored pct is capped", () => {
    expect(byId("b-groc").pct).toBe(100);
    expect(budgetUsedPct(byId("b-groc"))).toBe(120);
    expect(budgetUsedPct({ spent: 50, amount: 0 })).toBe(0);
  });

  it("orders over-limit first, then close to limit, fuller first", () => {
    expect(sortBudgetItems(ITEMS).map((b) => b.id)).toEqual(["b-groc", "b-rent", "b-food", "b-shop"]);
  });
});

describe("totals reconcile with the summary", () => {
  it("rolls budgets up without counting a subcategory budget inside its parent's", () => {
    const rollup = categoryBudgetRollup(ITEMS);
    // Food 1000 + Shopping 1000 + orphan Home › Rent 1800; Groceries is inside Food.
    expect(rollup.budgeted).toBe(3800);
    expect(rollup.spent).toBe(OCT.Food + OCT.Shopping + OCT["Home::Rent"]);
    expect(rollup.remaining).toBe(3800 - rollup.spent);
    // 3,450 of 3,800 is past the 80% line.
    expect(rollupStatus(rollup)).toBe("atRisk");
    expect(rollupStatus({ spent: 500, budgeted: 1000, usedPct: 50 })).toBe("onTrack");
    expect(rollupStatus({ spent: 900, budgeted: 1000, usedPct: 90 })).toBe("atRisk");
    expect(rollupStatus({ spent: 1100, budgeted: 1000, usedPct: 110 })).toBe("over");
  });

  it("matches each budget's spent with its eligible ledger rows", () => {
    const groceries = eligibleExpenses(LEDGER, "2026-10", "Food", "Groceries");
    expect(transactionStats(groceries).total).toBe(byId("b-groc").spent);
    const food = eligibleExpenses(LEDGER, "2026-10", "Food");
    expect(transactionStats(food).total).toBe(byId("b-food").spent);
    expect(eligibleExpenses(LEDGER, "2026-09", "Food", "Groceries").map((e) => e.amount)).toEqual([400]);
  });

  it("lists spending with no budget at all", () => {
    expect(unbudgetedSpending(OCT, ITEMS)).toEqual({ categories: [{ category: "Transport", amount: 80 }], total: 80 });
    expect(unbudgetedSpending(null, ITEMS).total).toBe(0);
  });
});

describe("routes and lookups", () => {
  it("carries the month, the category key and an optional subcategory", () => {
    expect(budgetsHref("2026-10")).toBe("/budgets?month=2026-10");
    expect(budgetsHref("2026-10", "trends")).toBe("/budgets?month=2026-10&tab=trends");
    const href = budgetDetailHref("Home & Household", "2026-10", { subcategory: "Rent / EMI", tab: "transactions" });
    expect(href).toBe("/budgets/Home%20%26%20Household?month=2026-10&sub=Rent%20%2F%20EMI&tab=transactions");
    expect(decodeCategoryParam(href.split("?")[0].replace("/budgets/", ""))).toBe("Home & Household");
  });

  it("finds the parent budget, or the subcategory's when asked, and nothing for a category without one", () => {
    expect(findBudget(ITEMS, "Food")?.id).toBe("b-food");
    expect(findBudget(ITEMS, "Food", "Groceries")?.id).toBe("b-groc");
    expect(findBudget(ITEMS, "Food", "Dining")).toBeNull();
    expect(findBudget(ITEMS, "Transport")).toBeNull();
    expect(budgetLabel({ category: "Food", subcategory: "Groceries" })).toBe("Food › Groceries");
  });
});

describe("pace inputs", () => {
  it("uses today in the current month, the whole month in a past one, day 1 in a future one", () => {
    expect(budgetDayOfMonth("2026-10", "2026-10-23")).toBe(23);
    expect(budgetDayOfMonth("2026-09", "2026-10-23")).toBe(30);
    expect(budgetDayOfMonth("2026-02", "2026-10-23")).toBe(28);
    expect(budgetDayOfMonth("2026-11", "2026-10-23")).toBe(1);
  });
});

describe("insights", () => {
  const fmt = (n: number) => `₹${Math.round(n)}`;

  it("names over and close-to-limit budgets and unbudgeted spending, nothing invented", () => {
    const insights = budgetOverviewInsights({
      items: ITEMS,
      monthly: null,
      monthlyBudget: 0,
      isCurrentMonth: true,
      unbudgeted: unbudgetedSpending(OCT, ITEMS),
      formatMoney: fmt,
    });
    expect(insights.map((i) => i.id)).toEqual(["over-b-groc", "over-b-rent", "risk-b-food", "unbudgeted"]);
    expect(insights[0].title).toBe("Food › Groceries is ₹100 over");
  });

  it("quotes monthly pace only for the month in progress", () => {
    const monthly = computeSpendlyBudget({ monthlyBudget: 4000, spent: 3530, monthKey: "2026-10", todayDay: 10, remainingCommitted: 0 });
    const base = { items: [], monthly, monthlyBudget: 4000, unbudgeted: { categories: [], total: 0 }, formatMoney: fmt };
    expect(budgetOverviewInsights({ ...base, isCurrentMonth: true }).map((i) => i.id)).toEqual(["monthly-pace"]);
    expect(budgetOverviewInsights({ ...base, isCurrentMonth: false })).toEqual([]);
  });

  it("explains one budget: over by, daily allowance, change from last month", () => {
    const pace = computeSpendlyBudget({ monthlyBudget: 1000, spent: 400, monthKey: "2026-10", todayDay: 10, remainingCommitted: 0 });
    const ok = budgetDetailInsights({ label: "Food", spent: 400, amount: 1000, pace, isCurrentMonth: true, previousSpent: 500, formatMoney: fmt });
    expect(ok.map((i) => i.id)).toEqual(["daily", "pace", "vs-previous"]);
    expect(ok[2].title).toBe("20% less than last month");
    const over = budgetDetailInsights({ label: "Food", spent: 1200, amount: 1000, pace, isCurrentMonth: false, previousSpent: null, formatMoney: fmt });
    expect(over.map((i) => i.id)).toEqual(["over"]);
    expect(over[0].title).toBe("₹200 over budget");
  });
});

describe("monthlyBudgetHistory", () => {
  it("rolls up each month that had budgets, with that month's spending", () => {
    const summaries = [...SUMMARIES.values()].map((s) => ({ period: s.period!, categoryTotals: s.categoryTotals! }));
    const history = monthlyBudgetHistory(BUDGETS, summaries, ["2026-08", "2026-09", "2026-10"], computeActiveCategoryBudgets);
    expect(history.map((p) => p.month)).toEqual(["2026-09", "2026-10"]);
    expect(history[0]).toMatchObject({ budgeted: 500, spent: 400, count: 1 });
    expect(history[1].budgeted).toBe(3800);
  });
});
