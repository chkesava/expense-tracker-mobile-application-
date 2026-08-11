import { describe, expect, it } from "vitest";
import type { Expense } from "../types/expense";
import {
  compareCurrentWithPrevious,
  getMonthlyTotals,
} from "./monthlyComparison";

function expense(month: string, amount: number): Expense {
  return {
    amount,
    category: "Food",
    note: "",
    date: `${month}-01`,
    month,
    createdAt: `${month}-01`,
  };
}

describe("monthlyComparison", () => {
  it("aggregates totals by month key", () => {
    expect(
      getMonthlyTotals([
        expense("2026-07", 100),
        expense("2026-08", 40),
        expense("2026-08", 60),
      ])
    ).toEqual({ "2026-07": 100, "2026-08": 100 });
  });

  it("returns null when there are no expenses", () => {
    expect(compareCurrentWithPrevious([])).toBeNull();
  });

  it("compares selected month vs previous calendar month", () => {
    const result = compareCurrentWithPrevious(
      [expense("2026-07", 200), expense("2026-08", 300)],
      "2026-08"
    );
    expect(result).toMatchObject({
      currentMonth: "2026-08",
      previousMonth: "2026-07",
      currentTotal: 300,
      previousTotal: 200,
      diff: 100,
      percent: 50,
    });
  });

  it("returns null percent when previous month spent nothing", () => {
    const result = compareCurrentWithPrevious(
      [expense("2026-08", 100)],
      "2026-08"
    );
    expect(result?.previousTotal).toBe(0);
    expect(result?.percent).toBeNull();
  });

  it("rolls January previous month into prior December", () => {
    const result = compareCurrentWithPrevious(
      [expense("2025-12", 50), expense("2026-01", 80)],
      "2026-01"
    );
    expect(result?.previousMonth).toBe("2025-12");
    expect(result?.diff).toBe(30);
  });
});
