import { describe, it, expect } from "vitest";
import { calculateDashboardSummaries, calculateAccountBalances } from "./reconciliation";
import type { Expense, Income, Account } from "../types/expense";

describe("reconciliation", () => {
  it("calculates dashboard summaries correctly", () => {
    const expenses: Expense[] = [
      { id: "e1", accountId: "a1", amount: 100, date: "2026-10-01", category: "Food" } as Expense,
      { id: "e2", accountId: "a1", amount: 50, date: "2026-10-05", category: "Food" } as Expense,
      { id: "e3", accountId: "a1", amount: 200, date: "2026-10-15", category: "Travel" } as Expense,
      { id: "e4", accountId: "a1", amount: 300, date: "2026-11-01", category: "Food" } as Expense,
      { id: "e5", accountId: "a1", amount: 50, date: "2026-10-20", category: "Food", voidedAt: "now" } as Expense, // voided
    ];

    const incomes: Income[] = [
      { id: "i1", accountId: "a1", amount: 1000, date: "2026-10-10" } as Income,
      { id: "i2", accountId: "a1", amount: 1000, date: "2026-11-10" } as Income,
      { id: "i3", accountId: "a1", amount: 500, date: "2026-10-15", voidedAt: "now" } as Income, // voided
    ];

    const dashboards = calculateDashboardSummaries(expenses, incomes);

    expect(dashboards.size).toBe(2);
    
    const oct = dashboards.get("2026-10");
    expect(oct).toBeDefined();
    expect(oct?.totalExpenses).toBe(350); // 100 + 50 + 200
    expect(oct?.totalIncome).toBe(1000);
    expect(oct?.categoryTotals).toEqual({
      "Food": 150,
      "Travel": 200,
    });
    
    const nov = dashboards.get("2026-11");
    expect(nov).toBeDefined();
    expect(nov?.totalExpenses).toBe(300);
    expect(nov?.totalIncome).toBe(1000);
  });

  it("calculates account balances for a basic bank account", () => {
    const account = { id: "a1", name: "Bank", typeId: "t1" } as Account;
    const incomes = [{ id: "i1", accountId: "a1", amount: 1000, date: "2026-10-01" } as Income];
    const expenses = [{ id: "e1", accountId: "a1", amount: 300, date: "2026-10-05" } as Expense];

    const res = calculateAccountBalances({
      account,
      typeName: "Bank",
      expenses,
      incomes,
      payments: [],
      transfers: [],
      entries: [],
      borrowings: [],
      borrowingRepayments: [],
      receivables: [],
      receivableRepayments: [],
      bills: [],
      today: "2026-10-09"
    });

    expect(res.currentBalance).toBe(700);
  });
});
