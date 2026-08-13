import { describe, expect, it } from "vitest";

import type { Expense } from "../types/expense";
import type { Space } from "../types/space";
import {
  budgetProgressTier,
  buildSpaceCategoryBreakdown,
  expensesInSpace,
  summarizeSpace,
  summarizeSpaces,
} from "./spaceMath";

function makeSpace(overrides: Partial<Space> = {}): Space {
  return {
    id: "s1",
    userId: "u1",
    name: "Brother Hospital",
    status: "ACTIVE",
    ...overrides,
  };
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "e1",
    amount: 1000,
    category: "Medical",
    note: "",
    date: "2026-08-01",
    month: "2026-08",
    createdAt: null,
    ...overrides,
  };
}

describe("expensesInSpace", () => {
  it("returns only expenses assigned to that space", () => {
    const expenses = [
      makeExpense({ id: "e1", spaceId: "s1" }),
      makeExpense({ id: "e2", spaceId: "s2" }),
      makeExpense({ id: "e3" }),
    ];

    expect(expensesInSpace(expenses, "s1").map((e) => e.id)).toEqual(["e1"]);
  });

  it("returns nothing for an empty space id", () => {
    const expenses = [makeExpense({ spaceId: "s1" })];
    expect(expensesInSpace(expenses, "")).toEqual([]);
  });

  it("excludes expenses whose space was removed", () => {
    const expenses = [makeExpense({ id: "e1", spaceId: null })];
    expect(expensesInSpace(expenses, "s1")).toEqual([]);
  });
});

describe("budgetProgressTier", () => {
  it("is none without a budget", () => {
    expect(budgetProgressTier(150, false)).toBe("none");
  });

  it("crosses tiers at 75, 90 and 100 percent", () => {
    expect(budgetProgressTier(0, true)).toBe("safe");
    expect(budgetProgressTier(74.9, true)).toBe("safe");
    expect(budgetProgressTier(75, true)).toBe("warning");
    expect(budgetProgressTier(89.9, true)).toBe("warning");
    expect(budgetProgressTier(90, true)).toBe("danger");
    expect(budgetProgressTier(99.9, true)).toBe("danger");
    expect(budgetProgressTier(100, true)).toBe("over");
    expect(budgetProgressTier(140, true)).toBe("over");
  });
});

describe("summarizeSpace", () => {
  it("totals only the expenses in the space", () => {
    const expenses = [
      makeExpense({ id: "e1", amount: 5000, spaceId: "s1" }),
      makeExpense({ id: "e2", amount: 2500, spaceId: "s1" }),
      makeExpense({ id: "e3", amount: 9999, spaceId: "s2" }),
      makeExpense({ id: "e4", amount: 1234 }),
    ];

    const summary = summarizeSpace(makeSpace(), expenses);

    expect(summary.totalSpent).toBe(7500);
    expect(summary.expenseCount).toBe(2);
  });

  it("is empty for a space with no expenses", () => {
    const summary = summarizeSpace(makeSpace(), []);

    expect(summary.totalSpent).toBe(0);
    expect(summary.expenseCount).toBe(0);
    expect(summary.firstExpenseDate).toBeNull();
    expect(summary.lastExpenseDate).toBeNull();
  });

  it("reports remaining budget and percent used", () => {
    const expenses = [makeExpense({ amount: 7500, spaceId: "s1" })];
    const summary = summarizeSpace(makeSpace({ budget: 10000 }), expenses);

    expect(summary.hasBudget).toBe(true);
    expect(summary.budgetRemaining).toBe(2500);
    expect(summary.percentUsed).toBe(75);
    expect(summary.tier).toBe("warning");
  });

  it("goes negative and reports over when the budget is exceeded", () => {
    const expenses = [makeExpense({ amount: 12000, spaceId: "s1" })];
    const summary = summarizeSpace(makeSpace({ budget: 10000 }), expenses);

    expect(summary.budgetRemaining).toBe(-2000);
    expect(summary.percentUsed).toBe(120);
    expect(summary.tier).toBe("over");
  });

  it("treats a missing or zero budget as no budget", () => {
    const expenses = [makeExpense({ amount: 500, spaceId: "s1" })];

    expect(summarizeSpace(makeSpace(), expenses).hasBudget).toBe(false);
    expect(summarizeSpace(makeSpace({ budget: 0 }), expenses).hasBudget).toBe(
      false
    );
    expect(summarizeSpace(makeSpace({ budget: null }), expenses).tier).toBe(
      "none"
    );
  });

  it("tracks the first and last expense dates", () => {
    const expenses = [
      makeExpense({ id: "e1", date: "2026-08-20", spaceId: "s1" }),
      makeExpense({ id: "e2", date: "2026-08-02", spaceId: "s1" }),
      makeExpense({ id: "e3", date: "2026-08-11", spaceId: "s1" }),
    ];

    const summary = summarizeSpace(makeSpace(), expenses);

    expect(summary.firstExpenseDate).toBe("2026-08-02");
    expect(summary.lastExpenseDate).toBe("2026-08-20");
  });
});

describe("buildSpaceCategoryBreakdown", () => {
  it("groups by category, largest first, with percentages", () => {
    const expenses = [
      makeExpense({ id: "e1", amount: 6000, category: "Medical" }),
      makeExpense({ id: "e2", amount: 3000, category: "Travel" }),
      makeExpense({ id: "e3", amount: 1000, category: "Medical" }),
    ];

    const breakdown = buildSpaceCategoryBreakdown(expenses);

    expect(breakdown).toEqual([
      { category: "Medical", total: 7000, count: 2, percentage: 70 },
      { category: "Travel", total: 3000, count: 1, percentage: 30 },
    ]);
  });

  it("labels missing categories as Uncategorized", () => {
    const breakdown = buildSpaceCategoryBreakdown([
      makeExpense({ amount: 100, category: "" }),
    ]);

    expect(breakdown[0].category).toBe("Uncategorized");
  });

  it("returns an empty breakdown for no expenses", () => {
    expect(buildSpaceCategoryBreakdown([])).toEqual([]);
  });

  it("reports zero percentages when every amount is zero", () => {
    const breakdown = buildSpaceCategoryBreakdown([
      makeExpense({ amount: 0, category: "Medical" }),
    ]);

    expect(breakdown[0].percentage).toBe(0);
  });
});

describe("summarizeSpaces", () => {
  it("totals spend and budget across spaces and counts unassigned expenses", () => {
    const spaces = [
      makeSpace({ id: "s1", budget: 10000 }),
      makeSpace({ id: "s2", name: "Renovation", budget: 5000 }),
    ];
    const expenses = [
      makeExpense({ id: "e1", amount: 4000, spaceId: "s1" }),
      makeExpense({ id: "e2", amount: 6000, spaceId: "s2" }),
      makeExpense({ id: "e3", amount: 900 }),
      makeExpense({ id: "e4", amount: 100, spaceId: null }),
    ];

    const totals = summarizeSpaces(spaces, expenses);

    expect(totals.totalSpent).toBe(10000);
    expect(totals.totalBudget).toBe(15000);
    expect(totals.spaceCount).toBe(2);
    expect(totals.overBudgetCount).toBe(1);
    expect(totals.unassignedExpenseCount).toBe(2);
  });

  it("returns zeroes when there are no spaces", () => {
    const totals = summarizeSpaces([], [makeExpense()]);

    expect(totals.totalSpent).toBe(0);
    expect(totals.spaceCount).toBe(0);
    expect(totals.unassignedExpenseCount).toBe(1);
  });
});
