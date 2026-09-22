import { describe, expect, it } from "vitest";

import type {
  AccountActivity,
  AccountEntry,
  Expense,
  Income,
} from "@/shared/types/expense";
import { enrichAccountActivities } from "./accountActivityFilters";
import {
  accountHistoryWindowMonths,
  computeAccountHealthMetrics,
} from "./accountHealth";

const ANCHOR = "2026-09";

function build(
  activities: AccountActivity[],
  expenses: Expense[] = [],
  incomes: Income[] = [],
  entries: AccountEntry[] = []
) {
  return enrichAccountActivities(activities, expenses, incomes, entries);
}

function expense(
  id: string,
  date: string,
  amount: number,
  runningBalance?: number
): AccountActivity {
  return {
    id,
    date,
    amount,
    type: "debit",
    linkedExpenseId: id,
    category: "Food & Groceries",
    runningBalance,
  };
}

function income(
  id: string,
  date: string,
  amount: number,
  runningBalance?: number
): AccountActivity {
  return {
    id,
    date,
    amount,
    type: "credit",
    linkedIncomeId: id,
    source: "Salary",
    runningBalance,
  };
}

function transfer(
  id: string,
  date: string,
  amount: number,
  type: "debit" | "credit",
  runningBalance?: number
): AccountActivity {
  return {
    id,
    date,
    amount,
    type,
    linkedTransferId: id,
    isTransfer: true,
    counterpartyName: "Savings",
    runningBalance,
  };
}

describe("account health metrics", () => {
  describe("accountHistoryWindowMonths", () => {
    it("lists the window newest first", () => {
      expect(accountHistoryWindowMonths(3, ANCHOR)).toEqual([
        "2026-09",
        "2026-08",
        "2026-07",
      ]);
    });

    it("crosses a year boundary", () => {
      expect(accountHistoryWindowMonths(3, "2026-01")).toEqual([
        "2026-01",
        "2025-12",
        "2025-11",
      ]);
    });
  });

  describe("empty account", () => {
    it("reports zeroes and no averages or extremes", () => {
      const metrics = computeAccountHealthMetrics([], 6, {
        anchorMonth: ANCHOR,
      });
      expect(metrics.transactionCount).toBe(0);
      expect(metrics.monthsWithActivity).toBe(0);
      expect(metrics.incomeTotal).toBe(0);
      expect(metrics.expenseTotal).toBe(0);
      expect(metrics.averageMonthlyIncome).toBeUndefined();
      expect(metrics.averageMonthlySpend).toBeUndefined();
      expect(metrics.averageMonthlyBalance).toBeUndefined();
      expect(metrics.highestBalance).toBeUndefined();
      expect(metrics.lowestBalance).toBeUndefined();
      expect(metrics.lastActivityDate).toBeUndefined();
    });
  });

  describe("single month", () => {
    it("averages over the one month the account has existed", () => {
      const records = build([
        expense("e1", "2026-09-10", 2_000, 8_000),
        income("i1", "2026-09-01", 10_000, 10_000),
      ]);
      const metrics = computeAccountHealthMetrics(records, 6, {
        anchorMonth: ANCHOR,
      });
      expect(metrics.monthsWithActivity).toBe(1);
      expect(metrics.transactionCount).toBe(2);
      // Divided by 1, not by the 6-month window.
      expect(metrics.averageMonthlyIncome).toBe(10_000);
      expect(metrics.averageMonthlySpend).toBe(2_000);
    });
  });

  describe("multi month", () => {
    const records = build([
      expense("sep-e", "2026-09-10", 2_000, 18_000),
      income("sep-i", "2026-09-01", 10_000, 20_000),
      expense("aug-e", "2026-08-10", 4_000, 10_000),
      income("aug-i", "2026-08-01", 6_000, 14_000),
      income("jul-i", "2026-07-01", 8_000, 8_000),
    ]);

    it("totals and averages across the months in the window", () => {
      const metrics = computeAccountHealthMetrics(records, 6, {
        anchorMonth: ANCHOR,
      });
      expect(metrics.monthsWithActivity).toBe(3);
      expect(metrics.transactionCount).toBe(5);
      expect(metrics.incomeTotal).toBe(24_000);
      expect(metrics.expenseTotal).toBe(6_000);
      // July is the first month, so three months have elapsed.
      expect(metrics.averageMonthlyIncome).toBe(8_000);
      expect(metrics.averageMonthlySpend).toBe(2_000);
    });

    it("reports the highest and lowest balance with their dates", () => {
      const metrics = computeAccountHealthMetrics(records, 6, {
        anchorMonth: ANCHOR,
      });
      expect(metrics.highestBalance).toEqual({
        amount: 20_000,
        date: "2026-09-01",
      });
      expect(metrics.lowestBalance).toEqual({
        amount: 8_000,
        date: "2026-07-01",
      });
    });

    it("averages the month-end balances", () => {
      const metrics = computeAccountHealthMetrics(records, 3, {
        anchorMonth: ANCHOR,
      });
      // Sep closes 18,000; Aug closes 10,000; Jul closes 8,000.
      expect(metrics.averageMonthlyBalance).toBe(12_000);
    });

    it("reports the most recent activity date", () => {
      const metrics = computeAccountHealthMetrics(records, 6, {
        anchorMonth: ANCHOR,
      });
      expect(metrics.lastActivityDate).toBe("2026-09-10");
    });
  });

  describe("window boundaries", () => {
    const records = build([
      expense("inside", "2026-07-01", 1_000, 5_000),
      expense("outside", "2026-06-30", 9_000, 6_000),
    ]);

    it("includes the first day of the oldest month in the window", () => {
      const metrics = computeAccountHealthMetrics(records, 3, {
        anchorMonth: ANCHOR,
      });
      expect(metrics.transactionCount).toBe(1);
      expect(metrics.expenseTotal).toBe(1_000);
    });

    it("excludes the last day of the month before the window", () => {
      const metrics = computeAccountHealthMetrics(records, 3, {
        anchorMonth: ANCHOR,
      });
      expect(metrics.lastActivityDate).toBe("2026-07-01");
      expect(metrics.highestBalance?.amount).toBe(5_000);
    });

    it("widening the window brings the older row back in", () => {
      const metrics = computeAccountHealthMetrics(records, 6, {
        anchorMonth: ANCHOR,
      });
      expect(metrics.transactionCount).toBe(2);
      expect(metrics.expenseTotal).toBe(10_000);
    });
  });

  describe("transfer-only account", () => {
    it("keeps transfers out of income and spending", () => {
      const records = build([
        transfer("t-out", "2026-09-10", 3_000, "debit", 5_000),
        transfer("t-in", "2026-09-01", 8_000, "credit", 8_000),
      ]);
      const metrics = computeAccountHealthMetrics(records, 6, {
        anchorMonth: ANCHOR,
      });
      expect(metrics.incomeTotal).toBe(0);
      expect(metrics.expenseTotal).toBe(0);
      expect(metrics.averageMonthlyIncome).toBe(0);
      expect(metrics.averageMonthlySpend).toBe(0);
      expect(metrics.transfersIn).toBe(8_000);
      expect(metrics.transfersOut).toBe(3_000);
      // Balances are still real money movement and remain reportable.
      expect(metrics.highestBalance?.amount).toBe(8_000);
      expect(metrics.transactionCount).toBe(2);
    });
  });

  describe("credit cards", () => {
    it("never averages or ranks an outstanding liability as a balance", () => {
      const records = build([
        expense("card-e", "2026-09-10", 2_000),
        income("card-cashback", "2026-09-05", 250),
      ]);
      const metrics = computeAccountHealthMetrics(records, 6, {
        anchorMonth: ANCHOR,
        supportsRunningBalance: false,
      });
      expect(metrics.averageMonthlyBalance).toBeUndefined();
      expect(metrics.highestBalance).toBeUndefined();
      expect(metrics.lowestBalance).toBeUndefined();
      // Spending metrics still work for a card.
      expect(metrics.expenseTotal).toBe(2_000);
      expect(metrics.transactionCount).toBe(2);
    });
  });

  describe("partial history", () => {
    it("skips rows with no running balance when ranking extremes", () => {
      const records = build([
        expense("after", "2026-09-10", 1_000, 4_000),
        expense("before-baseline", "2026-08-10", 50_000),
      ]);
      const metrics = computeAccountHealthMetrics(records, 6, {
        anchorMonth: ANCHOR,
      });
      expect(metrics.highestBalance).toEqual({
        amount: 4_000,
        date: "2026-09-10",
      });
      expect(metrics.lowestBalance).toEqual({
        amount: 4_000,
        date: "2026-09-10",
      });
      // The row itself still counts as activity and as spending.
      expect(metrics.transactionCount).toBe(2);
      expect(metrics.expenseTotal).toBe(51_000);
    });
  });

  describe("negative balances", () => {
    it("ranks an overdrawn balance as the lowest", () => {
      const records = build([
        income("recover", "2026-09-20", 5_000, 3_000),
        expense("overdraw", "2026-09-10", 7_000, -2_000),
        income("start", "2026-09-01", 5_000, 5_000),
      ]);
      const metrics = computeAccountHealthMetrics(records, 6, {
        anchorMonth: ANCHOR,
      });
      expect(metrics.lowestBalance).toEqual({
        amount: -2_000,
        date: "2026-09-10",
      });
      expect(metrics.highestBalance).toEqual({
        amount: 5_000,
        date: "2026-09-01",
      });
    });
  });
});
