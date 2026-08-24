import { describe, expect, it } from "vitest";
import { filterByLens, getBudgetVsActual, getTopCategories } from "../utils/categoryInsights";
import type { Expense, CategoryBudget } from "../types/expense";

const sampleExpenses: Expense[] = [
  {
    amount: 100,
    category: "Food",
    subcategory: "Groceries",
    note: "a",
    date: "2026-07-01",
    month: "2026-07",
    createdAt: null,
  },
  {
    amount: 50,
    category: "Entertainment",
    subcategory: "OTT / Music",
    note: "netflix",
    date: "2026-07-02",
    month: "2026-07",
    createdAt: null,
  },
  {
    amount: 200,
    category: "Travel",
    subcategory: "Petrol / Diesel",
    note: "petrol",
    date: "2026-07-03",
    month: "2026-07",
    createdAt: null,
  },
];

describe("categoryInsights", () => {
  it("filters subscription lens", () => {
    const subs = filterByLens(sampleExpenses, "subscriptions");
    expect(subs).toHaveLength(1);
    expect(subs[0].subcategory).toBe("OTT / Music");
  });

  it("ranks top categories", () => {
    const tops = getTopCategories(sampleExpenses, 2);
    expect(tops[0].category).toBe("Travel");
    expect(tops[0].value).toBe(200);
  });

  it("computes budget vs actual for subcategory", () => {
    const budgets: CategoryBudget[] = [
      {
        id: "1",
        category: "Food",
        subcategory: "Groceries",
        amount: 500,
        month: "2026-07",
      },
    ];
    const rows = getBudgetVsActual(sampleExpenses, budgets, "2026-07");
    expect(rows[0].actual).toBe(100);
    expect(rows[0].pct).toBe(20);
  });
});
