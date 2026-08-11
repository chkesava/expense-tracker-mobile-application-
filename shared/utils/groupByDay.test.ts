import { describe, expect, it } from "vitest";
import type { Expense } from "../types/expense";
import { groupByDay } from "./groupByDay";

function expense(date: string, amount: number): Expense {
  return {
    amount,
    category: "Food",
    note: "",
    date,
    month: date.slice(0, 7),
    createdAt: date,
  };
}

describe("groupByDay chart helper", () => {
  it("returns empty array for no expenses", () => {
    expect(groupByDay([])).toEqual([]);
  });

  it("sums per date and sorts chronologically", () => {
    expect(
      groupByDay([
        expense("2026-08-03", 10),
        expense("2026-08-01", 5),
        expense("2026-08-03", 7),
      ])
    ).toEqual([
      { date: "2026-08-01", value: 5 },
      { date: "2026-08-03", value: 17 },
    ]);
  });
});
