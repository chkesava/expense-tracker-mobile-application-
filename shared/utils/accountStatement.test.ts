import { describe, expect, it } from "vitest";

import type {
  AccountActivity,
  AccountEntry,
  Expense,
  Income,
} from "@/shared/types/expense";
import { enrichAccountActivities } from "./accountActivityFilters";
import {
  buildAccountStatement,
  isValidStatementPeriod,
  resolveStatementPeriod,
  type AccountStatementMeta,
  type StatementPeriod,
} from "./accountStatement";

const TODAY = "2026-09-22";

const ACCOUNT: AccountStatementMeta = {
  name: "HDFC Savings",
  institution: "HDFC Bank",
  last4: "4821",
  typeLabel: "Personal Account",
  currency: "INR",
  timezone: "Asia/Kolkata",
};

function build(
  activities: AccountActivity[],
  expenses: Expense[] = [],
  incomes: Income[] = [],
  entries: AccountEntry[] = []
) {
  return enrichAccountActivities(activities, expenses, incomes, entries);
}

function statement(
  activities: AccountActivity[],
  period: StatementPeriod,
  options: { supportsRunningBalance?: boolean } = {}
) {
  return buildAccountStatement(build(activities), ACCOUNT, period, {
    generatedAt: TODAY,
    ...options,
  });
}

function range(fromDate: string, toDate: string): StatementPeriod {
  return { preset: "custom", fromDate, toDate, label: `${fromDate} to ${toDate}` };
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
    note: `Expense ${id}`,
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
  transferId = id,
  runningBalance?: number
): AccountActivity {
  return {
    id,
    date,
    amount,
    type,
    linkedTransferId: transferId,
    isTransfer: true,
    counterpartyName: "ICICI Savings",
    runningBalance,
  };
}

describe("statement periods", () => {
  describe("resolveStatementPeriod", () => {
    it("runs this month from the 1st to today, never past it", () => {
      const period = resolveStatementPeriod("this-month", TODAY);

      expect(period.fromDate).toBe("2026-09-01");
      expect(period.toDate).toBe(TODAY);
    });

    it("covers last month whole, including its final day", () => {
      const period = resolveStatementPeriod("last-month", TODAY);

      expect(period.fromDate).toBe("2026-08-01");
      expect(period.toDate).toBe("2026-08-31");
    });

    it("ends last month on the 28th of a non-leap February", () => {
      const period = resolveStatementPeriod("last-month", "2026-03-15");

      expect(period.fromDate).toBe("2026-02-01");
      expect(period.toDate).toBe("2026-02-28");
    });

    it("ends last month on the 29th of a leap February", () => {
      const period = resolveStatementPeriod("last-month", "2024-03-15");

      expect(period.toDate).toBe("2024-02-29");
    });

    it("rolls last month back across a year boundary", () => {
      const period = resolveStatementPeriod("last-month", "2026-01-10");

      expect(period.fromDate).toBe("2025-12-01");
      expect(period.toDate).toBe("2025-12-31");
    });

    it("counts the current month as one of the last 3 months", () => {
      const period = resolveStatementPeriod("last-3-months", TODAY);

      expect(period.fromDate).toBe("2026-07-01");
      expect(period.toDate).toBe(TODAY);
    });

    it("runs this year from 1 January to today", () => {
      const period = resolveStatementPeriod("this-year", TODAY);

      expect(period.fromDate).toBe("2026-01-01");
      expect(period.toDate).toBe(TODAY);
    });

    it("takes a custom period as given", () => {
      const period = resolveStatementPeriod("custom", TODAY, {
        fromDate: "2025-04-01",
        toDate: "2025-06-30",
      });

      expect(period.fromDate).toBe("2025-04-01");
      expect(period.toDate).toBe("2025-06-30");
    });
  });

  describe("isValidStatementPeriod", () => {
    it("rejects a period that ends before it starts", () => {
      expect(
        isValidStatementPeriod({ fromDate: "2026-09-10", toDate: "2026-09-01" })
      ).toBe(false);
    });

    it("accepts a single-day period", () => {
      expect(
        isValidStatementPeriod({ fromDate: "2026-09-10", toDate: "2026-09-10" })
      ).toBe(true);
    });

    it("rejects a malformed date", () => {
      expect(
        isValidStatementPeriod({ fromDate: "10-09-2026", toDate: "2026-09-10" })
      ).toBe(false);
    });
  });
});

describe("account statement", () => {
  describe("period boundaries", () => {
    // Records arrive newest-first, the order buildAccountActivities() returns.
    const activities = [
      expense("e-after", "2026-10-01", 100, 700),
      expense("e-last", "2026-09-30", 100, 800),
      expense("e-first", "2026-09-01", 100, 900),
      expense("e-before", "2026-08-31", 100, 1000),
    ];

    it("includes both end dates and excludes everything outside", () => {
      const result = statement(activities, range("2026-09-01", "2026-09-30"));

      expect(result.rows.map((row) => row.id)).toEqual(["e-first", "e-last"]);
      expect(result.transactionCount).toBe(2);
    });

    it("includes a transaction dated exactly on the first day", () => {
      const result = statement(activities, range("2026-09-01", "2026-09-01"));

      expect(result.rows.map((row) => row.id)).toEqual(["e-first"]);
    });

    it("includes a transaction dated exactly on the last day", () => {
      const result = statement(activities, range("2026-09-30", "2026-09-30"));

      expect(result.rows.map((row) => row.id)).toEqual(["e-last"]);
    });
  });

  describe("ordering", () => {
    it("lists rows oldest first, the direction a balance accumulates", () => {
      const result = statement(
        [
          expense("c", "2026-09-10", 100, 800),
          expense("b", "2026-09-05", 100, 900),
          expense("a", "2026-09-01", 100, 1000),
        ],
        range("2026-09-01", "2026-09-30")
      );

      expect(result.rows.map((row) => row.id)).toEqual(["a", "b", "c"]);
      expect(result.rows.map((row) => row.runningBalance)).toEqual([1000, 900, 800]);
    });

    it("does not mutate the records it was given", () => {
      const records = build([
        expense("b", "2026-09-05", 100, 900),
        expense("a", "2026-09-01", 100, 1000),
      ]);
      const before = records.map((record) => record.activity.id);

      buildAccountStatement(records, ACCOUNT, range("2026-09-01", "2026-09-30"));

      expect(records.map((record) => record.activity.id)).toEqual(before);
    });
  });

  describe("reconciliation", () => {
    const activities = [
      transfer("t-out", "2026-09-20", 500, "debit", "tr1", 5500),
      expense("e1", "2026-09-15", 1000, 6000),
      income("i1", "2026-09-10", 3000, 7000),
      expense("e0", "2026-09-05", 400, 4000),
    ];

    it("reconciles opening + money in - money out to closing", () => {
      const result = statement(activities, range("2026-09-01", "2026-09-30"));

      expect(result.openingBalance).toBeDefined();
      expect(result.closingBalance).toBeDefined();
      expect(
        result.openingBalance! + result.moneyIn - result.moneyOut
      ).toBeCloseTo(result.closingBalance!, 5);
    });

    it("takes the closing balance from the newest row, not a recomputation", () => {
      const result = statement(activities, range("2026-09-01", "2026-09-30"));

      expect(result.closingBalance).toBe(5500);
    });

    it("keeps transfers out of income and expenses but inside money out", () => {
      const result = statement(activities, range("2026-09-01", "2026-09-30"));

      expect(result.income).toBe(3000);
      expect(result.expenses).toBe(1400);
      expect(result.transfersOut).toBe(500);
      expect(result.moneyOut).toBe(1900);
      expect(result.netChange).toBe(1100);
    });

    it("sums money in and money out across every row in the period", () => {
      const result = statement(activities, range("2026-09-01", "2026-09-30"));

      expect(result.moneyIn).toBe(3000);
      expect(result.moneyIn - result.moneyOut).toBeCloseTo(result.netChange, 5);
    });
  });

  describe("opening balance for a custom period", () => {
    it("derives opening from the period's own closing and net change", () => {
      // Mid-month start: opening is not a month boundary figure.
      const result = statement(
        [
          income("i1", "2026-09-20", 2000, 9000),
          expense("e1", "2026-09-15", 500, 7000),
        ],
        range("2026-09-14", "2026-09-21")
      );

      expect(result.closingBalance).toBe(9000);
      expect(result.netChange).toBe(1500);
      expect(result.openingBalance).toBe(7500);
    });

    it("carries the previous balance through a period with no activity", () => {
      const result = statement(
        [expense("e1", "2026-08-20", 500, 4200)],
        range("2026-09-01", "2026-09-30")
      );

      expect(result.transactionCount).toBe(0);
      expect(result.openingBalance).toBe(4200);
      expect(result.closingBalance).toBe(4200);
    });

    it("says so when a quiet period has no balance behind it at all", () => {
      const result = statement([], range("2026-09-01", "2026-09-30"));

      expect(result.openingBalance).toBeUndefined();
      expect(result.closingBalance).toBeUndefined();
      expect(result.notes.join(" ")).toContain("No balance is known");
    });

    it("reports totals but no balances when a row predates the baseline", () => {
      // Rows before the account's balance baseline carry no running balance.
      const result = statement(
        [
          expense("e1", "2026-09-15", 500, 7000),
          expense("e0", "2026-09-02", 300, undefined),
        ],
        range("2026-09-01", "2026-09-30")
      );

      expect(result.expenses).toBe(800);
      expect(result.transactionCount).toBe(2);
      expect(result.openingBalance).toBeUndefined();
      expect(result.closingBalance).toBeUndefined();
      expect(result.notes.join(" ")).toContain("balance baseline");
    });
  });

  describe("empty periods", () => {
    it("says nothing was recorded rather than leaving the reader guessing", () => {
      const result = statement([], range("2026-09-01", "2026-09-30"));

      expect(result.rows).toEqual([]);
      expect(result.transactionCount).toBe(0);
      expect(result.moneyIn).toBe(0);
      expect(result.moneyOut).toBe(0);
      expect(result.notes.join(" ")).toContain("No transactions");
    });
  });

  describe("credit cards", () => {
    it("shows no opening or closing balance and explains why", () => {
      const result = statement(
        [expense("e1", "2026-09-15", 500)],
        range("2026-09-01", "2026-09-30"),
        { supportsRunningBalance: false }
      );

      expect(result.openingBalance).toBeUndefined();
      expect(result.closingBalance).toBeUndefined();
      expect(result.notes.join(" ")).toContain("liability");
      // The spending itself is still reported.
      expect(result.expenses).toBe(500);
    });
  });

  describe("transfers", () => {
    it("counts an ordinary transfer once", () => {
      const result = statement(
        [transfer("transfer-out-t1", "2026-09-10", 500, "debit", "t1", 4500)],
        range("2026-09-01", "2026-09-30")
      );

      expect(result.transferCount).toBe(1);
      expect(result.transfersOut).toBe(500);
    });

    it("counts mirrored legs of one transfer as a single movement", () => {
      const result = statement(
        [
          transfer("transfer-in-t1", "2026-09-10", 500, "credit", "t1", 5000),
          transfer("transfer-out-t1", "2026-09-10", 500, "debit", "t1", 4500),
        ],
        range("2026-09-01", "2026-09-30")
      );

      expect(result.transferCount).toBe(1);
      // Both legs are real postings and both still appear on the statement.
      expect(result.rows).toHaveLength(2);
      expect(result.transfersIn).toBe(500);
      expect(result.transfersOut).toBe(500);
      // They cancel, so the balance is unchanged — the statement must not
      // imply money entered or left the account.
      expect(result.netChange).toBe(0);
    });
  });

  describe("bill payments, cashback, borrowings and receivables", () => {
    it("classifies each as money movement, never as earning or spending", () => {
      const result = statement(
        [
          {
            id: "p1",
            date: "2026-09-18",
            amount: 4000,
            type: "debit",
            isBillPayment: true,
            linkedPaymentId: "p1",
            counterpartyName: "HDFC Card",
          },
          {
            id: "b1",
            date: "2026-09-12",
            amount: 20000,
            type: "credit",
            isBorrowing: true,
            linkedBorrowingId: "b1",
          },
          {
            id: "l1",
            date: "2026-09-08",
            amount: 3000,
            type: "debit",
            isReceivable: true,
            linkedReceivableId: "l1",
          },
          {
            id: "c1",
            date: "2026-09-04",
            amount: 3000,
            type: "credit",
            isReceivableRepayment: true,
            linkedReceivableRepaymentId: "c1",
          },
        ],
        range("2026-09-01", "2026-09-30")
      );

      expect(result.income).toBe(0);
      expect(result.expenses).toBe(0);
      expect(result.transferCount).toBe(4);
      expect(result.transfersIn).toBe(23000);
      expect(result.transfersOut).toBe(7000);
      // They are still postings, so money in and out still describe them.
      expect(result.moneyIn).toBe(23000);
      expect(result.moneyOut).toBe(7000);
    });

    it("labels a cashback row as cashback, not as a bill payment", () => {
      const result = statement(
        [
          {
            id: "payment-in-p2",
            date: "2026-09-14",
            amount: 250,
            type: "credit",
            isCashback: true,
            linkedPaymentId: "p2",
          },
        ],
        range("2026-09-01", "2026-09-30"),
        { supportsRunningBalance: false }
      );

      expect(result.rows[0].subtype).toBe("Cashback");
      expect(result.income).toBe(0);
    });
  });

  describe("rows", () => {
    it("puts a debit and a credit on their own sides of the ledger", () => {
      const result = statement(
        [income("i1", "2026-09-10", 3000, 9000), expense("e1", "2026-09-05", 500, 6000)],
        range("2026-09-01", "2026-09-30")
      );

      const [debitRow, creditRow] = result.rows;
      expect(debitRow.debit).toBe(500);
      expect(debitRow.credit).toBeUndefined();
      expect(creditRow.credit).toBe(3000);
      expect(creditRow.debit).toBeUndefined();
    });

    it("carries description, category and counterparty from the ledger", () => {
      const result = statement(
        [transfer("t1", "2026-09-10", 500, "debit", "t1", 4500)],
        range("2026-09-01", "2026-09-30")
      );

      expect(result.rows[0].subtype).toBe("Transfer");
      expect(result.rows[0].counterparty).toBe("ICICI Savings");
    });
  });
});
