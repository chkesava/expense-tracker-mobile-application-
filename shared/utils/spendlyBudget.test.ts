import { describe, expect, it } from "vitest";

import {
  amountDueWithinDays,
  budgetStatusMessage,
  cashFlowByMonth,
  computeSpendlyBudget,
  daysUntil,
  duesWithinDays,
  remainingCommittedThisMonth,
} from "./spendlyBudget";

describe("computeSpendlyBudget", () => {
  it("computes Safe to Spend from flexible remaining and days left", () => {
    const budget = computeSpendlyBudget({
      monthlyBudget: 31000,
      spent: 9000,
      monthKey: "2026-08",
      todayDay: 9,
      remainingCommitted: 2000,
    });
    expect(budget.daysInMonth).toBe(31);
    expect(budget.daysLeft).toBe(22);
    expect(budget.remaining).toBe(22000);
    expect(budget.flexibleRemaining).toBe(20000);
    expect(budget.safeToSpendDaily).toBeCloseTo(20000 / 22);
    expect(budget.status).toBe("healthy");
    expect(budgetStatusMessage(budget)).toBe("On track for this month.");
  });

  it("returns zero Safe to Spend when flexible remaining is gone", () => {
    const budget = computeSpendlyBudget({
      monthlyBudget: 10000,
      spent: 8000,
      monthKey: "2026-08",
      todayDay: 26,
      remainingCommitted: 2500,
    });
    expect(budget.flexibleRemaining).toBe(0);
    expect(budget.safeToSpendDaily).toBe(0);
    expect(budget.pctUsed).toBe(80);
    expect(budget.isOverPace).toBe(false);
    expect(budget.status).toBe("watch");
  });

  it("marks projected overspend as attention, not a second healthy story", () => {
    const budget = computeSpendlyBudget({
      monthlyBudget: 10000,
      spent: 6000,
      monthKey: "2026-08",
      todayDay: 10,
    });
    expect(budget.projectedMonthEnd).toBe(18600);
    expect(budget.isOverPace).toBe(true);
    expect(budget.status).toBe("attention");
    expect(budgetStatusMessage(budget)).toBe("Current pace exceeds the monthly plan.");
  });

  it("marks over budget as attention", () => {
    const budget = computeSpendlyBudget({
      monthlyBudget: 5000,
      spent: 6200,
      monthKey: "2026-08",
      todayDay: 20,
    });
    expect(budget.isOverBudget).toBe(true);
    expect(budget.safeToSpendDaily).toBe(0);
    expect(budget.status).toBe("attention");
    expect(budgetStatusMessage(budget)).toBe("Over budget — slow new spending.");
  });

  it("uses days left of 1 on the last day instead of dividing by zero", () => {
    const budget = computeSpendlyBudget({
      monthlyBudget: 3100,
      spent: 1000,
      monthKey: "2026-08",
      todayDay: 31,
    });
    expect(budget.daysLeft).toBe(0);
    expect(budget.safeToSpendDaily).toBe(2100);
    expect(budget.requiredDailyLimit).toBe(0);
  });
});

describe("remainingCommittedThisMonth", () => {
  it("counts only remaining dues in this month", () => {
    const total = remainingCommittedThisMonth(
      [
        { amount: 500, dueDate: "2026-08-20" },
        { amount: 200, dueDate: "2026-08-09" },
        { amount: 800, dueDate: "2026-09-01" },
      ],
      "2026-08",
      "2026-08-10"
    );
    expect(total).toBe(500);
  });
});

describe("upcoming dues", () => {
  it("sums amounts due within seven days including overdue", () => {
    const items = [
      {
        id: "1",
        name: "Gym",
        amount: 1300,
        dueDate: "2026-08-14",
        daysRemaining: daysUntil("2026-08-14", "2026-08-10"),
        kind: "subscription" as const,
      },
      {
        id: "2",
        name: "Card",
        amount: 4000,
        dueDate: "2026-08-20",
        daysRemaining: daysUntil("2026-08-20", "2026-08-10"),
        kind: "card" as const,
      },
    ];
    expect(amountDueWithinDays(items, 7)).toBe(1300);
    expect(duesWithinDays(items, 7).map((item) => item.name)).toEqual(["Gym"]);
  });
});

describe("cashFlowByMonth", () => {
  it("builds a six-month income minus spend series", () => {
    const series = cashFlowByMonth(
      [
        { amount: 2000, month: "2026-08" },
        { amount: 500, month: "2026-07" },
      ],
      [
        { amount: 8000, month: "2026-08" },
        { amount: 7000, month: "2026-07" },
      ],
      "2026-08",
      3
    );
    expect(series.map((row) => row.month)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(series[1]).toMatchObject({ income: 7000, spent: 500, net: 6500 });
    expect(series[2]).toMatchObject({ income: 8000, spent: 2000, net: 6000 });
  });
});
