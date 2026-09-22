import { describe, expect, it } from "vitest";

import type {
  AccountActivity,
  AccountEntry,
  Expense,
  Income,
} from "@/shared/types/expense";
import { enrichAccountActivities } from "./accountActivityFilters";
import {
  accountMonthDateRange,
  listAccountActivityMonths,
  selectAccountMonthActivities,
  summarizeAccountMonth,
} from "./accountMonthSummary";

/**
 * Newest-first, as `buildAccountActivities()` returns them, with running
 * balances already assigned. Opening balance of the account is 30,000.
 *
 * Sep: salary +50,000, groceries -1,250, transfer out -12,500, card bill -3,000
 * Aug: one expense only
 * Jul: nothing (a quiet month between Jun and Aug)
 * Jun: a single row from before the balance baseline (no running balance)
 */
const activities: AccountActivity[] = [
  {
    id: "sep-bill",
    date: "2026-09-30",
    amount: 3_000,
    type: "debit",
    linkedPaymentId: "sep-bill",
    isBillPayment: true,
    counterpartyName: "Axis Card",
    runningBalance: 63_250,
  },
  {
    id: "sep-transfer",
    date: "2026-09-15",
    amount: 12_500,
    type: "debit",
    linkedTransferId: "sep-transfer",
    isTransfer: true,
    counterpartyName: "HDFC Savings",
    runningBalance: 66_250,
  },
  {
    id: "sep-salary",
    date: "2026-09-01",
    amount: 50_000,
    type: "credit",
    linkedIncomeId: "sep-salary",
    source: "Salary",
    runningBalance: 78_750,
  },
  {
    id: "sep-groceries",
    // Deliberately the first day of the month, to pin the month boundary.
    date: "2026-09-01",
    amount: 1_250,
    type: "debit",
    linkedExpenseId: "sep-groceries",
    category: "Food & Groceries",
    runningBalance: 28_750,
  },
  {
    id: "aug-rent",
    // Last day of August: must not leak into September.
    date: "2026-08-31",
    amount: 20_000,
    type: "debit",
    linkedExpenseId: "aug-rent",
    category: "Housing",
    runningBalance: 30_000,
  },
  {
    id: "jun-pre-baseline",
    date: "2026-06-10",
    amount: 4_000,
    type: "debit",
    linkedExpenseId: "jun-pre-baseline",
    category: "Travel & Holidays",
  },
];

const expenses: Expense[] = [
  {
    id: "sep-groceries",
    amount: 1_250,
    category: "Food & Groceries",
    note: "Weekly vegetables",
    date: "2026-09-01",
    month: "2026-09",
    accountId: "account-a",
    createdAt: "2026-09-01",
  },
  {
    id: "aug-rent",
    amount: 20_000,
    category: "Housing",
    note: "September rent",
    date: "2026-08-31",
    month: "2026-08",
    accountId: "account-a",
    createdAt: "2026-08-31",
  },
  {
    id: "jun-pre-baseline",
    amount: 4_000,
    category: "Travel & Holidays",
    note: "Ooty trip",
    date: "2026-06-10",
    month: "2026-06",
    accountId: "account-a",
    createdAt: "2026-06-10",
  },
];

const incomes: Income[] = [
  {
    id: "sep-salary",
    amount: 50_000,
    source: "Salary",
    note: "Monthly salary",
    date: "2026-09-01",
    month: "2026-09",
    accountId: "account-a",
    createdAt: "2026-09-01",
  },
];

const entries: AccountEntry[] = [];

function records() {
  return enrichAccountActivities(activities, expenses, incomes, entries);
}

describe("account month summary", () => {
  describe("listAccountActivityMonths", () => {
    it("lists only months with activity, newest first", () => {
      expect(listAccountActivityMonths(records())).toEqual([
        "2026-09",
        "2026-08",
        "2026-06",
      ]);
    });

    it("returns nothing for an account with no activity", () => {
      expect(listAccountActivityMonths([])).toEqual([]);
    });
  });

  describe("accountMonthDateRange", () => {
    it("covers the whole month", () => {
      expect(accountMonthDateRange("2026-09")).toEqual({
        fromDate: "2026-09-01",
        toDate: "2026-09-30",
      });
    });

    it("handles 31-day months and February in a leap year", () => {
      expect(accountMonthDateRange("2026-08").toDate).toBe("2026-08-31");
      expect(accountMonthDateRange("2024-02").toDate).toBe("2024-02-29");
      expect(accountMonthDateRange("2026-02").toDate).toBe("2026-02-28");
    });
  });

  describe("month boundaries", () => {
    it("keeps the last day of the previous month out of the month", () => {
      const september = selectAccountMonthActivities(records(), "2026-09");
      expect(september.map((record) => record.activity.id)).toEqual([
        "sep-bill",
        "sep-transfer",
        "sep-salary",
        "sep-groceries",
      ]);
      expect(september.map((r) => r.activity.id)).not.toContain("aug-rent");
    });

    it("counts a first-of-month row in that month", () => {
      const summary = summarizeAccountMonth(records(), "2026-09");
      expect(summary.activityCount).toBe(4);
      expect(summary.expenses).toBe(1_250);
    });
  });

  describe("bucketing", () => {
    it("keeps transfers out of income and expenses", () => {
      const summary = summarizeAccountMonth(records(), "2026-09");
      expect(summary.income).toBe(50_000);
      expect(summary.expenses).toBe(1_250);
      // The outgoing transfer and the card bill payment are both money
      // movement, never spending.
      expect(summary.transfersOut).toBe(15_500);
      expect(summary.transfersIn).toBe(0);
    });

    it("nets every row regardless of bucket", () => {
      const summary = summarizeAccountMonth(records(), "2026-09");
      expect(summary.netChange).toBe(50_000 - 1_250 - 12_500 - 3_000);
    });

    it("reconciles opening, net change and closing", () => {
      const summary = summarizeAccountMonth(records(), "2026-09");
      expect(summary.closingBalance).toBe(63_250);
      expect(summary.openingBalance).toBe(30_000);
      expect(
        summary.openingBalance! + summary.netChange
      ).toBe(summary.closingBalance);
    });

    it("matches the previous month's closing balance", () => {
      const august = summarizeAccountMonth(records(), "2026-08");
      const september = summarizeAccountMonth(records(), "2026-09");
      expect(august.closingBalance).toBe(september.openingBalance);
    });
  });

  describe("no-data months", () => {
    it("carries the previous balance through a quiet month", () => {
      const july = summarizeAccountMonth(records(), "2026-07");
      expect(july.activityCount).toBe(0);
      expect(july.income).toBe(0);
      expect(july.expenses).toBe(0);
      expect(july.netChange).toBe(0);
      // August's rows are newer than July, so the carried balance comes from
      // the newest month *before* July, which is pre-baseline.
      expect(july.openingBalance).toBeUndefined();
      expect(july.closingBalance).toBe(july.openingBalance);
    });

    it("reports zeroes for a month outside the account's history", () => {
      const summary = summarizeAccountMonth(records(), "2027-01");
      expect(summary.activityCount).toBe(0);
      expect(summary.netChange).toBe(0);
      expect(summary.closingBalance).toBe(63_250);
      expect(summary.openingBalance).toBe(63_250);
    });
  });

  describe("transfer-only months", () => {
    it("reports movement with no income or expense", () => {
      const transferOnly = enrichAccountActivities(
        [
          {
            id: "only-transfer-in",
            date: "2026-05-04",
            amount: 8_000,
            type: "credit",
            linkedTransferId: "only-transfer-in",
            isTransfer: true,
            counterpartyName: "Salary Account",
            runningBalance: 8_000,
          },
        ],
        [],
        [],
        []
      );
      const summary = summarizeAccountMonth(transferOnly, "2026-05");
      expect(summary.income).toBe(0);
      expect(summary.expenses).toBe(0);
      expect(summary.transfersIn).toBe(8_000);
      expect(summary.transfersOut).toBe(0);
      expect(summary.netChange).toBe(8_000);
      expect(summary.closingBalance).toBe(8_000);
      expect(summary.openingBalance).toBe(0);
    });
  });

  describe("partial account history", () => {
    it("reports no balances for a month before the balance baseline", () => {
      const june = summarizeAccountMonth(records(), "2026-06");
      expect(june.activityCount).toBe(1);
      expect(june.expenses).toBe(4_000);
      expect(june.netChange).toBe(-4_000);
      // The row carries no running balance, so stating one would be a guess.
      expect(june.openingBalance).toBeUndefined();
      expect(june.closingBalance).toBeUndefined();
    });

    it("still reports totals when balances are unavailable", () => {
      const june = summarizeAccountMonth(records(), "2026-06");
      expect(june.expenses).toBe(4_000);
    });
  });

  describe("credit cards", () => {
    it("never presents a card's outstanding as a balance", () => {
      const summary = summarizeAccountMonth(records(), "2026-09", {
        supportsRunningBalance: false,
      });
      expect(summary.openingBalance).toBeUndefined();
      expect(summary.closingBalance).toBeUndefined();
      // Totals still describe the cycle.
      expect(summary.income).toBe(50_000);
      expect(summary.expenses).toBe(1_250);
      expect(summary.netChange).toBe(33_250);
    });
  });

  describe("rounding", () => {
    it("keeps fractional amounts from drifting", () => {
      const fractional = enrichAccountActivities(
        [
          {
            id: "b",
            date: "2026-04-02",
            amount: 0.2,
            type: "debit",
            linkedExpenseId: "b",
            runningBalance: 0.1,
          },
          {
            id: "a",
            date: "2026-04-01",
            amount: 0.3,
            type: "credit",
            linkedIncomeId: "a",
            runningBalance: 0.3,
          },
        ],
        [],
        [],
        []
      );
      const summary = summarizeAccountMonth(fractional, "2026-04");
      expect(summary.netChange).toBe(0.1);
      expect(summary.openingBalance).toBe(0);
    });
  });
});
