import { describe, expect, it } from "vitest";
import type { Expense, CategoryBudget } from "../types/expense";
import { getBudgetForecasts } from "./rangeAnalytics";

describe("getBudgetForecasts", () => {
  it("triggers alert when budget is projected to overshoot before end of month", () => {
    const expenses: Expense[] = [
      { amount: 150, category: "Food", note: "Groceries", date: "2026-06-02", month: "2026-06", createdAt: null },
      { amount: 250, category: "Food", note: "Dinner", date: "2026-06-08", month: "2026-06", createdAt: null },
    ];
    const budgets: CategoryBudget[] = [
      { id: "b1", category: "Food", amount: 1000, month: "2026-06" },
    ];
    // Today is June 10 (Day 10). Total spend is 400. Daily rate is 400 / 10 = 40.
    // Projected month-end (30 days) is 40 * 30 = 1200.
    // Exceed day should be ceil(1000 / 40) = 25.
    // Overshoot percent should be (1200 - 1000) / 1000 = 20%.
    const forecasts = getBudgetForecasts(expenses, budgets, "2026-06-10");

    expect(forecasts).toHaveLength(1);
    expect(forecasts[0]).toEqual({
      category: "Food",
      budgetAmount: 1000,
      currentSpend: 400,
      projectedSpend: 1200,
      overshootPercent: 20,
      exceedDay: 25,
    });
  });

  it("does not trigger alert when budget is on track", () => {
    const expenses: Expense[] = [
      { amount: 100, category: "Rent", note: "Utilities", date: "2026-06-05", month: "2026-06", createdAt: null },
      { amount: 200, category: "Rent", note: "More Utilities", date: "2026-06-09", month: "2026-06", createdAt: null },
    ];
    const budgets: CategoryBudget[] = [
      { id: "b2", category: "Rent", amount: 1000, month: "2026-06" },
    ];
    // Today is June 10 (Day 10). Total spend is 300. Daily rate is 30.
    // Projected is 900. No overshoot.
    const forecasts = getBudgetForecasts(expenses, budgets, "2026-06-10");

    expect(forecasts).toHaveLength(0);
  });

  it("ignores budgets that have already been exceeded", () => {
    const expenses: Expense[] = [
      { amount: 550, category: "Shopping", note: "Clothes", date: "2026-06-03", month: "2026-06", createdAt: null },
    ];
    const budgets: CategoryBudget[] = [
      { id: "b3", category: "Shopping", amount: 500, month: "2026-06" },
    ];
    // Today is June 10. Already exceeded (550 > 500). Proactive warning should ignore it.
    const forecasts = getBudgetForecasts(expenses, budgets, "2026-06-10");

    expect(forecasts).toHaveLength(0);
  });

  it("supports different month lengths (e.g. February)", () => {
    const expenses: Expense[] = [
      { amount: 150, category: "Entertainment", note: "Movie", date: "2026-02-05", month: "2026-02", createdAt: null },
    ];
    const budgets: CategoryBudget[] = [
      { id: "b4", category: "Entertainment", amount: 280, month: "2026-02" },
    ];
    // Feb 2026 has 28 days.
    // Today is Feb 14 (Day 14). Total spend is 150. Daily rate is 150 / 14 = 10.714.
    // Projected is 10.714 * 28 = 300.
    // Overshoot percent: (300 - 280) / 280 = 7.14% -> 7%.
    // Exceed day: ceil(280 / 10.714) = 27.
    const forecasts = getBudgetForecasts(expenses, budgets, "2026-02-14");

    expect(forecasts).toHaveLength(1);
    expect(forecasts[0]).toEqual({
      category: "Entertainment",
      budgetAmount: 280,
      currentSpend: 150,
      projectedSpend: 300,
      overshootPercent: 7,
      exceedDay: 27,
    });
  });
});
