import { afterEach, describe, expect, it, vi } from "vitest";
import type { Income } from "../types/expense";
import { getIncomeSummary, groupIncomesByDay } from "./incomeSummary";

function income(partial: Partial<Income> & Pick<Income, "amount" | "source" | "date">): Income {
  return {
    month: partial.date.slice(0, 7),
    note: "",
    createdAt: partial.date,
    ...partial,
  };
}

describe("incomeSummary", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("summarizes totals and sources", () => {
    expect(getIncomeSummary([])).toEqual({ total: 0, bySource: {} });
    expect(
      getIncomeSummary([
        income({ amount: 1000, source: "Salary", date: "2026-08-01" }),
        income({ amount: 200, source: "Freelance", date: "2026-08-02" }),
        income({ amount: 300, source: "Salary", date: "2026-08-03" }),
      ])
    ).toEqual({ total: 1500, bySource: { Salary: 1300, Freelance: 200 } });
  });

  it("groups incomes into today / yesterday / earlier using timezone-aware keys", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T12:00:00.000Z"));

    const items = [
      income({ amount: 1, source: "A", date: "2026-08-11" }),
      income({ amount: 2, source: "B", date: "2026-08-10" }),
      income({ amount: 3, source: "C", date: "2026-08-01" }),
    ];

    const grouped = groupIncomesByDay(items, "UTC");
    expect(grouped.today.map((i) => i.source)).toEqual(["A"]);
    expect(grouped.yesterday.map((i) => i.source)).toEqual(["B"]);
    expect(grouped.earlier.map((i) => i.source)).toEqual(["C"]);
  });
});
