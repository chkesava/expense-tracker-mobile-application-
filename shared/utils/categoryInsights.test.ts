import { describe, expect, it } from "vitest";
import { filterByLens, getBudgetVsActual, getTopCategories } from "../utils/categoryInsights";
import type { Expense, CategoryBudget } from "../types/expense";

const sampleExpenses: Expense[] = [
  {
    amount: 100,
    category: "Food & Dining",
    subcategory: "Groceries",
    note: "a",
    date: "2026-07-01",
    month: "2026-07",
    createdAt: null,
  },
  {
    amount: 50,
    category: "Technology",
    subcategory: "AI Tools",
    note: "claude",
    date: "2026-07-02",
    month: "2026-07",
    createdAt: null,
  },
  {
    amount: 200,
    category: "Transportation",
    subcategory: "Fuel",
    note: "petrol",
    date: "2026-07-03",
    month: "2026-07",
    createdAt: null,
  },
];

describe("categoryInsights", () => {
  it("filters AI lens", () => {
    const ai = filterByLens(sampleExpenses, "ai");
    expect(ai).toHaveLength(1);
    expect(ai[0].subcategory).toBe("AI Tools");
  });

  it("ranks top categories", () => {
    const tops = getTopCategories(sampleExpenses, 2);
    expect(tops[0].category).toBe("Transportation");
    expect(tops[0].value).toBe(200);
  });

  it("computes budget vs actual for subcategory", () => {
    const budgets: CategoryBudget[] = [
      {
        id: "1",
        category: "Food & Dining",
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
