import { describe, expect, it } from "vitest";
import type { Expense, Income } from "../types/expense";
import { generateTransactionsCsv, generateTransactionsJson } from "./csvExport";

describe("csvExport utilities", () => {
  const mockExpenses: Expense[] = [
    {
      id: "exp_1",
      date: "2026-08-01",
      month: "2026-08",
      category: "Food",
      subcategory: "Groceries",
      amount: 45.5,
      accountId: "acc_1",
      note: 'Dinner, "Special" treats',
      tags: ["food", "weekend"],
      createdAt: 1722470400000,
    },
    {
      id: "exp_2",
      date: "2026-08-02",
      month: "2026-08",
      category: "Transport",
      amount: 12.0,
      note: "Bus fare",
      createdAt: 1722556800000,
    },
  ];

  const mockIncomes: Income[] = [
    {
      id: "inc_1",
      date: "2026-08-01",
      month: "2026-08",
      source: "Salary",
      amount: 3000,
      accountId: "acc_1",
      note: "August paycheck",
      createdAt: 1722470400000,
    },
  ];

  const accountMap = new Map<string, string>([["acc_1", "Main Checking"]]);

  it("generates correct RFC-4180 CSV with headers and escaped strings", () => {
    const csv = generateTransactionsCsv(mockExpenses, mockIncomes, {
      currency: "INR",
      accountMap,
    });

    const lines = csv.split("\n");
    expect(lines[0]).toBe("Date,Type,Category,Subcategory,Amount,Currency,Account,Note,Tags,ID");
    
    // Row 1 (2026-08-02 Expense sorted first by descending date)
    expect(lines[1]).toContain("2026-08-02,Expense,Transport");
    expect(lines[1]).toContain("12,INR");

    // Row 2 / 3 with quoted string for comma and quotes
    const dinnerRow = lines.find((l) => l.includes("Food"));
    expect(dinnerRow).toBeDefined();
    expect(dinnerRow).toContain('"Dinner, ""Special"" treats"');
    expect(dinnerRow).toContain("Main Checking");
    expect(dinnerRow).toContain("food; weekend");

    // Income row
    const incomeRow = lines.find((l) => l.includes("Income,Salary"));
    expect(incomeRow).toBeDefined();
    expect(incomeRow).toContain("3000,INR,Main Checking");
  });

  it("generates structured JSON export with summary metadata", () => {
    const jsonStr = generateTransactionsJson(mockExpenses, mockIncomes, {
      currency: "USD",
      accountMap,
    });

    const parsed = JSON.parse(jsonStr);
    expect(parsed.currency).toBe("USD");
    expect(parsed.summary.totalExpensesCount).toBe(2);
    expect(parsed.summary.totalExpensesAmount).toBe(57.5);
    expect(parsed.summary.totalIncomesCount).toBe(1);
    expect(parsed.summary.totalIncomesAmount).toBe(3000);
    expect(parsed.expenses.length).toBe(2);
    expect(parsed.expenses[0].accountName).toBe("Main Checking");
    expect(parsed.incomes.length).toBe(1);
  });
});
