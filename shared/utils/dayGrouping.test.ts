import { describe, expect, it } from "vitest";
import { groupExpensesByDay } from "./dayGrouping";
import { getIncomeSummary, groupIncomesByDay } from "./incomeSummary";
import { formatDateKey } from "./dates";
import type { Account, Expense, Income } from "../types/expense";
import { previewBalanceAfterTransaction } from "./accountBalance";

describe("dayGrouping & transaction summary utilities", () => {
  const tz = "UTC";
  const todayStr = formatDateKey(new Date(), tz);
  const yDate = new Date();
  yDate.setDate(yDate.getDate() - 1);
  const yesterdayStr = formatDateKey(yDate, tz);
  const earlierStr = "2025-01-01";

  it("groups expenses correctly into today, yesterday, and earlier", () => {
    const expenses: Expense[] = [
      {
        id: "1",
        amount: 250,
        category: "Food",
        date: todayStr,
        month: todayStr.slice(0, 7),
        note: "Lunch",
        createdAt: new Date(),
      },
      {
        id: "2",
        amount: 1200,
        category: "Shopping",
        date: yesterdayStr,
        month: yesterdayStr.slice(0, 7),
        note: "Shoes",
        createdAt: new Date(),
      },
      {
        id: "3",
        amount: 80,
        category: "Travel",
        date: earlierStr,
        month: "2025-01",
        note: "Metro",
        createdAt: new Date(),
      },
    ];

    const result = groupExpensesByDay(expenses, tz);
    expect(result.today).toHaveLength(1);
    expect(result.today[0].id).toBe("1");
    expect(result.yesterday).toHaveLength(1);
    expect(result.yesterday[0].id).toBe("2");
    expect(result.earlier).toHaveLength(1);
    expect(result.earlier[0].id).toBe("3");
  });

  it("groups incomes correctly into today, yesterday, and earlier", () => {
    const incomes: Income[] = [
      {
        id: "inc-1",
        amount: 50000,
        source: "Salary",
        date: todayStr,
        month: todayStr.slice(0, 7),
        note: "Base salary",
        createdAt: new Date(),
      },
      {
        id: "inc-2",
        amount: 5000,
        source: "Freelance",
        date: yesterdayStr,
        month: yesterdayStr.slice(0, 7),
        note: "Consulting",
        createdAt: new Date(),
      },
      {
        id: "inc-3",
        amount: 200,
        source: "Dividend",
        date: earlierStr,
        month: "2025-01",
        note: "Stock dividend",
        createdAt: new Date(),
      },
    ];

    const result = groupIncomesByDay(incomes, tz);
    expect(result.today).toHaveLength(1);
    expect(result.yesterday).toHaveLength(1);
    expect(result.earlier).toHaveLength(1);

    const summary = getIncomeSummary(incomes);
    expect(summary.total).toBe(55200);
    expect(summary.bySource["Salary"]).toBe(50000);
    expect(summary.bySource["Freelance"]).toBe(5000);
  });

  it("calculates balance previews correctly after transactions", () => {
    const account: Account = {
      id: "acc-1",
      name: "Main Savings",
      typeId: "bank-type",
      openingBalance: 10000,
    };

    const expenses: Expense[] = [
      {
        id: "e1",
        amount: 1500,
        category: "Food",
        date: "2026-08-01",
        month: "2026-08",
        accountId: "acc-1",
        note: "Groceries",
        createdAt: new Date(),
      },
    ];

    const incomes: Income[] = [];

    // Prior balance = 10000 - 1500 = 8500
    // If adding a new expense of 500:
    const previewExpense = previewBalanceAfterTransaction(
      account,
      "Savings Account",
      expenses,
      incomes,
      "expense",
      500
    );
    expect(previewExpense).toBe(8000);

    // If adding a new income of 2000:
    const previewIncome = previewBalanceAfterTransaction(
      account,
      "Savings Account",
      expenses,
      incomes,
      "income",
      2000
    );
    expect(previewIncome).toBe(10500);
  });
});
