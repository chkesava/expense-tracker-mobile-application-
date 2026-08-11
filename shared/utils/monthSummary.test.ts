import { describe, expect, it } from "vitest";
import type { Expense } from "../types/expense";
import { getMonthlySummary } from "./monthSummary";

function expense(partial: Partial<Expense> & Pick<Expense, "amount" | "category">): Expense {
  return {
    note: "",
    date: "2026-08-01",
    month: "2026-08",
    createdAt: "2026-08-01",
    ...partial,
  };
}

describe("monthSummary", () => {
  it("returns zero total and empty categories for an empty list", () => {
    expect(getMonthlySummary([])).toEqual({ total: 0, byCategory: {} });
  });

  it("sums amounts and groups by category", () => {
    const result = getMonthlySummary([
      expense({ amount: 100, category: "Food" }),
      expense({ amount: 50, category: "Food" }),
      expense({ amount: 200, category: "Travel" }),
    ]);
    expect(result.total).toBe(350);
    expect(result.byCategory).toEqual({ Food: 150, Travel: 200 });
  });
});
