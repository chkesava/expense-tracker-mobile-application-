import { afterEach, describe, expect, it, vi } from "vitest";
import type { Expense, Income } from "@/shared/types/expense";
import { buildAdvisorContext } from "./aiAdvisorService";

function expense(partial: Partial<Expense> & Pick<Expense, "amount" | "category" | "date">): Expense {
  return {
    note: partial.note ?? "Vendor",
    month: partial.date.slice(0, 7),
    createdAt: partial.date,
    ...partial,
  };
}

function income(amount: number, date: string): Income {
  return {
    amount,
    date,
    month: date.slice(0, 7),
    source: "Salary",
    note: "",
    createdAt: date,
  };
}

describe("aiAdvisorService.buildAdvisorContext", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("scopes totals to the UTC current month and derives savings metrics", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T12:00:00.000Z"));

    const ctx = buildAdvisorContext(
      [
        expense({ amount: 2000, category: "Food", date: "2026-08-02", note: "Cafe" }),
        expense({ amount: 500, category: "Travel", date: "2026-08-03", note: "Uber" }),
        expense({ amount: 9999, category: "Food", date: "2026-07-02", note: "Old" }),
      ],
      [income(10000, "2026-08-01"), income(1000, "2026-07-01")],
      "INR"
    );

    expect(ctx.currentMonth).toBe("2026-08");
    expect(ctx.totalExpenses).toBe(2500);
    expect(ctx.totalIncome).toBe(10000);
    expect(ctx.netSavings).toBe(7500);
    expect(ctx.savingsRate).toBe(75);
    expect(ctx.topCategories[0]?.category).toBe("Food");
    expect(ctx.currency).toBe("INR");
  });

  it("handles empty ledgers without throwing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T12:00:00.000Z"));
    const ctx = buildAdvisorContext([], []);
    expect(ctx.totalExpenses).toBe(0);
    expect(ctx.totalIncome).toBe(0);
    expect(ctx.topCategories).toEqual([]);
  });
});
