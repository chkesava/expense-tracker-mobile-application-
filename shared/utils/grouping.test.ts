import { afterEach, describe, expect, it, vi } from "vitest";
import type { Expense } from "../types/expense";
import { groupByDay } from "./grouping";

function expense(date: string, amount = 10): Expense {
  return {
    amount,
    category: "Food",
    note: "",
    date,
    month: date.slice(0, 7),
    createdAt: date,
  };
}

describe("grouping.groupByDay (local calendar keys)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("splits expenses into today / yesterday / earlier using local calendar keys", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 11, 12, 0, 0));

    const result = groupByDay([
      expense("2026-08-11"),
      expense("2026-08-10"),
      expense("2026-08-01"),
    ]);

    expect(result.today).toHaveLength(1);
    expect(result.yesterday).toHaveLength(1);
    expect(result.earlier).toHaveLength(1);
  });
});
