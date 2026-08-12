import { describe, expect, it } from "vitest";
import type { Expense } from "../types/expense";
import {
  getAverageDailySpend,
  getHighestSpendingDay,
  getTopCategory,
} from "./smartSummary";

function expense(partial: Partial<Expense> & Pick<Expense, "amount" | "category" | "date">): Expense {
  return {
    note: "",
    month: partial.date.slice(0, 7),
    createdAt: partial.date,
    ...partial,
  };
}

describe("smartSummary", () => {
  it("returns nulls / zero for empty input", () => {
    expect(getHighestSpendingDay([])).toBeNull();
    expect(getTopCategory([])).toBeNull();
    expect(getAverageDailySpend([])).toBe(0);
  });

  it("finds highest spending day and top category", () => {
    const expenses = [
      expense({ amount: 50, category: "Food", date: "2026-08-01" }),
      expense({ amount: 80, category: "Food", date: "2026-08-02" }),
      expense({ amount: 20, category: "Travel", date: "2026-08-02" }),
    ];
    expect(getHighestSpendingDay(expenses)).toEqual({
      date: "2026-08-02",
      amount: 100,
    });
    expect(getTopCategory(expenses)).toEqual({ category: "Food", amount: 130 });
  });

  it("averages total across unique days", () => {
    expect(
      getAverageDailySpend([
        expense({ amount: 100, category: "Food", date: "2026-08-01" }),
        expense({ amount: 50, category: "Food", date: "2026-08-01" }),
        expense({ amount: 50, category: "Food", date: "2026-08-02" }),
      ])
    ).toBe(100); // 200 / 2 days
  });
});
