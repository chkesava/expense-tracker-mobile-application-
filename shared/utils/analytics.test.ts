import { describe, expect, it } from "vitest";
import type { Expense } from "../types/expense";
import {
  groupByAccount,
  groupByCategory,
  groupByMonth,
  groupBySubcategory,
  groupSubcategoriesFor,
} from "./analytics";

function expense(
  partial: Partial<Expense> & Pick<Expense, "amount" | "category" | "month">
): Expense {
  return {
    note: "",
    date: `${partial.month}-01`,
    createdAt: `${partial.month}-01`,
    ...partial,
  };
}

describe("analytics grouping helpers", () => {
  const sample: Expense[] = [
    expense({ amount: 100, category: "Food", subcategory: "Groceries", month: "2026-08", accountId: "a1" }),
    expense({ amount: 40, category: "Food", subcategory: "Dining", month: "2026-08", accountId: "a1" }),
    expense({ amount: 60, category: "Travel", month: "2026-07", accountId: "a2" }),
  ];

  it("groups by category", () => {
    expect(groupByCategory(sample)).toEqual(
      expect.arrayContaining([
        { category: "Food", value: 140 },
        { category: "Travel", value: 60 },
      ])
    );
  });

  it("groups by subcategory labels and sorts descending", () => {
    const result = groupBySubcategory(sample);
    expect(result[0]).toEqual({ category: "Food › Groceries", value: 100 });
    expect(result.map((r) => r.category)).toContain("Travel");
  });

  it("groups subcategories for a parent", () => {
    expect(groupSubcategoriesFor(sample, "Food")).toEqual([
      { subcategory: "Groceries", value: 100 },
      { subcategory: "Dining", value: 40 },
    ]);
  });

  it("groups by month and account", () => {
    expect(groupByMonth(sample)).toEqual(
      expect.arrayContaining([
        { month: "2026-08", value: 140 },
        { month: "2026-07", value: 60 },
      ])
    );
    expect(groupByAccount(sample)).toEqual(
      expect.arrayContaining([
        { accountId: "a1", value: 140 },
        { accountId: "a2", value: 60 },
      ])
    );
  });
});
