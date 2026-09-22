import { describe, expect, it } from "vitest";

import type {
  AccountActivity,
  AccountEntry,
  Expense,
  Income,
} from "@/shared/types/expense";
import { enrichAccountActivities } from "./accountActivityFilters";
import { computeAccountActivityStats } from "./accountActivityStats";

const ANCHOR = "2026-09";

function build(
  activities: AccountActivity[],
  expenses: Expense[] = [],
  incomes: Income[] = [],
  entries: AccountEntry[] = []
) {
  return enrichAccountActivities(activities, expenses, incomes, entries);
}

function stats(
  activities: AccountActivity[],
  window: 3 | 6 | 12 = 6,
  extras: {
    expenses?: Expense[];
    incomes?: Income[];
    entries?: AccountEntry[];
  } = {}
) {
  return computeAccountActivityStats(
    build(activities, extras.expenses, extras.incomes, extras.entries),
    window,
    { anchorMonth: ANCHOR }
  );
}

function expense(id: string, date: string, amount = 500): AccountActivity {
  return {
    id,
    date,
    amount,
    type: "debit",
    linkedExpenseId: id,
    category: "Food & Groceries",
  };
}

function income(id: string, date: string, amount = 5000): AccountActivity {
  return {
    id,
    date,
    amount,
    type: "credit",
    linkedIncomeId: id,
    source: "Salary",
  };
}

function transfer(
  id: string,
  date: string,
  type: "debit" | "credit",
  transferId = id,
  amount = 1000
): AccountActivity {
  return {
    id,
    date,
    amount,
    type,
    linkedTransferId: transferId,
    isTransfer: true,
    counterpartyName: "Savings",
  };
}

describe("account activity statistics", () => {
  describe("empty history", () => {
    it("reports nothing rather than zeroed dates or a rate over no days", () => {
      const result = stats([]);

      expect(result.totalTransactions).toBe(0);
      expect(result.incomeCount).toBe(0);
      expect(result.expenseCount).toBe(0);
      expect(result.transferCount).toBe(0);
      expect(result.refundCount).toBe(0);
      expect(result.activeDays).toBe(0);
      expect(result.firstActivityDate).toBeUndefined();
      expect(result.lastActivityDate).toBeUndefined();
      expect(result.spanDays).toBeUndefined();
      expect(result.averageTransactionsPerActiveDay).toBeUndefined();
    });
  });

  describe("single activity", () => {
    it("spans one day and averages one per active day", () => {
      const result = stats([expense("e1", "2026-09-10")]);

      expect(result.totalTransactions).toBe(1);
      expect(result.expenseCount).toBe(1);
      expect(result.activeDays).toBe(1);
      expect(result.firstActivityDate).toBe("2026-09-10");
      expect(result.lastActivityDate).toBe("2026-09-10");
      expect(result.spanDays).toBe(1);
      expect(result.averageTransactionsPerActiveDay).toBe(1);
    });
  });

  describe("mixed history", () => {
    const activities = [
      income("i1", "2026-09-01"),
      expense("e1", "2026-09-01"),
      expense("e2", "2026-09-01"),
      transfer("t1", "2026-08-15", "debit"),
      expense("e3", "2026-07-20"),
    ];

    it("counts each kind and every row", () => {
      const result = stats(activities);

      expect(result.totalTransactions).toBe(5);
      expect(result.incomeCount).toBe(1);
      expect(result.expenseCount).toBe(3);
      expect(result.transferCount).toBe(1);
      expect(result.otherCount).toBe(0);
    });

    it("counts distinct days, not rows, as active days", () => {
      const result = stats(activities);

      expect(result.activeDays).toBe(3);
      expect(result.averageTransactionsPerActiveDay).toBeCloseTo(1.7, 5);
    });

    it("reports the first and last dates and the span between them", () => {
      const result = stats(activities);

      expect(result.firstActivityDate).toBe("2026-07-20");
      expect(result.lastActivityDate).toBe("2026-09-01");
      // 20 Jul to 1 Sep inclusive.
      expect(result.spanDays).toBe(44);
    });

    it("sums the per-kind counts back to the total", () => {
      const result = stats(activities);

      expect(
        result.incomeCount +
          result.expenseCount +
          result.transferLegCount +
          result.refundCount +
          result.otherCount
      ).toBe(result.totalTransactions);
    });
  });

  describe("selected-period recalculation", () => {
    const activities = [
      expense("e1", "2026-09-05"),
      expense("e2", "2026-05-05"),
      expense("e3", "2025-11-05"),
    ];

    it("counts only the rows inside the window", () => {
      expect(stats(activities, 3).totalTransactions).toBe(1);
      expect(stats(activities, 6).totalTransactions).toBe(2);
      expect(stats(activities, 12).totalTransactions).toBe(3);
    });

    it("re-derives the first date from the window, not the whole history", () => {
      expect(stats(activities, 3).firstActivityDate).toBe("2026-09-05");
      expect(stats(activities, 6).firstActivityDate).toBe("2026-05-05");
      expect(stats(activities, 12).firstActivityDate).toBe("2025-11-05");
    });

    it("includes the whole oldest month of the window", () => {
      // The 6-month window from Sep 2026 reaches back to Apr 2026, so the
      // first day of April is inside it and March is not.
      expect(stats([expense("e1", "2026-04-01")], 6).totalTransactions).toBe(1);
      expect(stats([expense("e1", "2026-03-31")], 6).totalTransactions).toBe(0);
    });
  });

  describe("transfer counting", () => {
    it("counts an ordinary transfer leg once", () => {
      const result = stats([transfer("transfer-out-t1", "2026-09-04", "debit", "t1")]);

      expect(result.transferCount).toBe(1);
      expect(result.transferLegCount).toBe(1);
    });

    it("counts mirrored legs of one transfer as a single movement", () => {
      // Both ends of the same transfer landing in this account: the outgoing
      // and incoming legs are collected separately, so two rows describe one
      // movement of money.
      const result = stats([
        transfer("transfer-out-t1", "2026-09-04", "debit", "t1"),
        transfer("transfer-in-t1", "2026-09-04", "credit", "t1"),
      ]);

      expect(result.transferLegCount).toBe(2);
      expect(result.transferCount).toBe(1);
      // The rows themselves are still real and still counted as activity.
      expect(result.totalTransactions).toBe(2);
    });

    it("keeps separate transfers separate", () => {
      const result = stats([
        transfer("transfer-out-t1", "2026-09-04", "debit", "t1"),
        transfer("transfer-out-t2", "2026-09-06", "debit", "t2"),
      ]);

      expect(result.transferCount).toBe(2);
    });

    it("counts transfer-like rows with no movement id individually", () => {
      const entries: AccountEntry[] = [
        {
          id: "en1",
          accountId: "a1",
          date: "2026-09-08",
          amount: 300,
          direction: "credit",
          transferId: "tx-9",
        } as AccountEntry,
        {
          id: "en2",
          accountId: "a1",
          date: "2026-09-09",
          amount: 300,
          direction: "debit",
          transferId: "tx-9",
        } as AccountEntry,
      ];
      const activities: AccountActivity[] = [
        {
          id: "row-en1",
          date: "2026-09-08",
          amount: 300,
          type: "credit",
          linkedAccountEntryId: "en1",
        },
        {
          id: "row-en2",
          date: "2026-09-09",
          amount: 300,
          type: "debit",
          linkedAccountEntryId: "en2",
        },
      ];

      const result = stats(activities, 6, { entries });

      // Entry-backed rows are written one per account, so each is its own
      // movement even though the entries share a transfer id.
      expect(result.transferLegCount).toBe(2);
      expect(result.transferCount).toBe(2);
    });

    it("keeps transfers out of income and expenses", () => {
      const result = stats([
        transfer("t-in", "2026-09-04", "credit", "t1"),
        transfer("t-out", "2026-09-05", "debit", "t2"),
      ]);

      expect(result.incomeCount).toBe(0);
      expect(result.expenseCount).toBe(0);
      expect(result.transferCount).toBe(2);
    });
  });

  describe("card payments", () => {
    it("counts a bill payment as a transfer, never as an expense", () => {
      const result = stats([
        {
          id: "p1",
          date: "2026-09-12",
          amount: 4000,
          type: "debit",
          isBillPayment: true,
          linkedPaymentId: "p1",
          counterpartyName: "HDFC Card",
        },
      ]);

      expect(result.transferCount).toBe(1);
      expect(result.expenseCount).toBe(0);
      expect(result.incomeCount).toBe(0);
    });

    it("counts a received bill payment as a transfer, never as income", () => {
      const result = stats([
        {
          id: "payment-in-p1",
          date: "2026-09-12",
          amount: 4000,
          type: "credit",
          isBillPayment: true,
          linkedPaymentId: "p1",
          counterpartyName: "Salary Account",
        },
      ]);

      expect(result.transferCount).toBe(1);
      expect(result.incomeCount).toBe(0);
    });

    it("collapses both legs of one bill payment landing in the same account", () => {
      const result = stats([
        {
          id: "p1",
          date: "2026-09-12",
          amount: 4000,
          type: "debit",
          isBillPayment: true,
          linkedPaymentId: "p1",
        },
        {
          id: "payment-in-p1",
          date: "2026-09-12",
          amount: 4000,
          type: "credit",
          isBillPayment: true,
          linkedPaymentId: "p1",
        },
      ]);

      expect(result.transferLegCount).toBe(2);
      expect(result.transferCount).toBe(1);
    });

    it("counts cashback as a refund, not as income", () => {
      const result = stats([
        {
          id: "payment-in-p2",
          date: "2026-09-14",
          amount: 250,
          type: "credit",
          isCashback: true,
          linkedPaymentId: "p2",
        },
      ]);

      expect(result.refundCount).toBe(1);
      expect(result.incomeCount).toBe(0);
      expect(result.transferCount).toBe(0);
      expect(result.totalTransactions).toBe(1);
    });
  });

  describe("refunds", () => {
    it("counts a refund on its own rather than as income", () => {
      const result = stats([
        {
          id: "i2",
          date: "2026-09-03",
          amount: 800,
          type: "credit",
          linkedIncomeId: "i2",
          source: "Refund from Amazon",
        },
        income("i1", "2026-09-02"),
      ]);

      expect(result.refundCount).toBe(1);
      expect(result.incomeCount).toBe(1);
      expect(result.totalTransactions).toBe(2);
    });

    it("does not count a refund as an expense either", () => {
      const result = stats([
        {
          id: "e9",
          date: "2026-09-03",
          amount: 800,
          type: "debit",
          linkedExpenseId: "e9",
          category: "Refund adjustment",
        },
      ]);

      expect(result.refundCount).toBe(1);
      expect(result.expenseCount).toBe(0);
    });
  });

  describe("borrowings and lending", () => {
    it("counts money movement as transfers, not earning or spending", () => {
      const result = stats([
        {
          id: "b1",
          date: "2026-09-02",
          amount: 20000,
          type: "credit",
          linkedBorrowingId: "b1",
          isBorrowing: true,
        },
        {
          id: "r1",
          date: "2026-09-20",
          amount: 5000,
          type: "debit",
          linkedRepaymentId: "r1",
          isLoanRepayment: true,
        },
        {
          id: "l1",
          date: "2026-08-02",
          amount: 3000,
          type: "debit",
          linkedReceivableId: "l1",
          isReceivable: true,
        },
        {
          id: "c1",
          date: "2026-08-22",
          amount: 3000,
          type: "credit",
          linkedReceivableRepaymentId: "c1",
          isReceivableRepayment: true,
        },
      ]);

      expect(result.transferCount).toBe(4);
      expect(result.incomeCount).toBe(0);
      expect(result.expenseCount).toBe(0);
    });
  });
});
