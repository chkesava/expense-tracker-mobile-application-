import { afterEach, describe, expect, it, vi } from "vitest";
import type { Expense } from "../types/expense";
import { getWeeklySummary } from "./weeklySummary";

function expense(day: string, amount: number): Expense {
  return {
    amount,
    category: "Food",
    note: "",
    date: `2026-08-${day}`,
    month: "2026-08",
    createdAt: `2026-08-${day}`,
  };
}

describe("weeklySummary", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("bins days into weeks and pads empty weeks through month end", () => {
    const result = getWeeklySummary(
      [expense("01", 100), expense("08", 50), expense("31", 25)],
      "2026-08"
    );

    expect(result.weeks).toHaveLength(5); // Aug has 31 days → 5 week buckets
    expect(result.weeks[0]).toEqual({ week: 1, total: 100 });
    expect(result.weeks[1]).toEqual({ week: 2, total: 50 });
    expect(result.weeks[2]).toEqual({ week: 3, total: 0 });
    expect(result.weeks[4]).toEqual({ week: 5, total: 25 });
  });

  it("ignores expenses outside the requested month", () => {
    const result = getWeeklySummary(
      [
        expense("02", 10),
        {
          amount: 999,
          category: "Food",
          note: "",
          date: "2026-07-02",
          month: "2026-07",
          createdAt: "2026-07-02",
        },
      ],
      "2026-08"
    );
    expect(result.weeks[0]?.total).toBe(10);
  });

  it("computes current-week daily average only for the UTC calendar month of today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T12:00:00.000Z")); // day 11 → week 2

    const result = getWeeklySummary(
      [expense("08", 70), expense("11", 70)],
      "2026-08"
    );

    expect(result.currentWeek).toBe(2);
    // week 2 starts day 8 → daysSoFar = 11-8+1 = 4; avg of 140 / 4
    expect(result.currentWeekDaysSoFar).toBe(4);
    expect(result.currentWeekAvg).toBe(35);
  });

  it("skips current-week average for historical months", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T12:00:00.000Z"));
    const result = getWeeklySummary([expense("01", 100)], "2026-07");
    expect(result.currentWeek).toBeUndefined();
    expect(result.currentWeekAvg).toBe(0);
  });
});
