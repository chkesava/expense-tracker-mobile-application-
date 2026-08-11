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

describe("grouping.groupByDay (UTC ISO keys)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("splits expenses into today / yesterday / earlier using toISOString calendar keys", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T12:00:00.000Z"));

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
