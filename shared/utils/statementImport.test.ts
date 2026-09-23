import { describe, expect, it } from "vitest";

import type { Account, AccountPayment, Expense } from "../types/expense";
import {
  buildStatementImportFingerprint,
  planStatementImport,
  statementImportExpenseId,
} from "./statementImport";
import {
  assertCycleExportComplete,
  buildCreditCardCycleExport,
  creditCardCycleExportToCsv,
} from "./creditCardStatementExport";
import type { StatementLine } from "./statementParse";

const accountId = "cc-1";

const debit = (
  id: string,
  date: string,
  amount: number,
  merchant = "Amazon"
): StatementLine => ({
  id,
  date,
  amount,
  merchant,
  kind: "debit",
  raw: `${date} ${merchant} ${amount}`,
});

describe("statementImport fingerprints", () => {
  it("is stable for the same line and account", () => {
    const line = debit("1", "2026-08-10", 499, "Swiggy");
    const a = buildStatementImportFingerprint(accountId, line, {
      creditCardBillId: "bill-1",
    });
    const b = buildStatementImportFingerprint(accountId, line, {
      creditCardBillId: "bill-1",
    });
    expect(a).toBe(b);
    expect(statementImportExpenseId(a)).toMatch(/^stmt_[0-9a-f]{16}$/);
  });

  it("changes when the bill provenance changes", () => {
    const line = debit("1", "2026-08-10", 499, "Swiggy");
    const a = buildStatementImportFingerprint(accountId, line, {
      creditCardBillId: "bill-1",
    });
    const b = buildStatementImportFingerprint(accountId, line, {
      creditCardBillId: "bill-2",
    });
    expect(a).not.toBe(b);
  });
});

describe("planStatementImport", () => {
  it("plans a missing debit for import with provenance", () => {
    const plan = planStatementImport({
      accountId,
      lines: [debit("1", "2026-08-10", 499, "Swiggy")],
      expenses: [],
      payments: [],
      provenance: {
        creditCardBillId: "bill-1",
        periodStart: "2026-07-06",
        periodEnd: "2026-08-05",
      },
    });
    // 2026-08-10 is outside Jul 6–Aug 5
    expect(plan.outOfCycle).toHaveLength(1);
    expect(plan.toImport).toHaveLength(0);
  });

  it("imports in-cycle missing debits and skips amount/date duplicates", () => {
    const line = debit("1", "2026-08-01", 499, "Swiggy");
    const existing: Expense = {
      id: "exp-1",
      accountId,
      amount: 499,
      date: "2026-08-01",
      month: "2026-08",
      category: "Food",
      note: "Swiggy",
      createdAt: Date.now(),
    } as Expense;

    const plan = planStatementImport({
      accountId,
      lines: [line],
      expenses: [existing],
      payments: [],
      provenance: {
        creditCardBillId: "bill-1",
        periodStart: "2026-07-06",
        periodEnd: "2026-08-05",
      },
    });
    expect(plan.toImport).toHaveLength(0);
    expect(plan.skippedDuplicate[0]?.reason).toBe("matched_amount_date");
  });

  it("skips fingerprint duplicates even when amounts were edited later", () => {
    const line = debit("1", "2026-08-01", 499, "Swiggy");
    const fingerprint = buildStatementImportFingerprint(accountId, line, {
      creditCardBillId: "bill-1",
    });
    const existing: Expense = {
      id: statementImportExpenseId(fingerprint),
      accountId,
      amount: 500,
      date: "2026-08-02",
      month: "2026-08",
      category: "Food",
      note: "Edited",
      statementImportFingerprint: fingerprint,
      createdAt: Date.now(),
    } as Expense;

    const plan = planStatementImport({
      accountId,
      lines: [line],
      expenses: [existing],
      payments: [],
      provenance: {
        creditCardBillId: "bill-1",
        periodStart: "2026-07-06",
        periodEnd: "2026-08-05",
      },
    });
    expect(plan.skippedDuplicate[0]?.reason).toBe("fingerprint");
    expect(plan.toImport).toHaveLength(0);
  });

  it("returns import drafts with bill linkage for true missing lines", () => {
    const line = debit("1", "2026-08-01", 1200, "Amazon");
    const plan = planStatementImport({
      accountId,
      lines: [line],
      expenses: [],
      payments: [],
      provenance: {
        creditCardBillId: "bill-1",
        accountDocumentId: "doc-1",
        periodStart: "2026-07-06",
        periodEnd: "2026-08-05",
      },
    });
    expect(plan.toImport).toHaveLength(1);
    expect(plan.toImport[0]?.draft).toMatchObject({
      amount: 1200,
      note: "Amazon",
      creditCardBillId: "bill-1",
      accountDocumentId: "doc-1",
    });
    expect(plan.toImport[0]?.draft.statementImportFingerprint).toContain(
      accountId
    );
  });
});

describe("creditCardStatementExport", () => {
  const account = {
    id: accountId,
    name: "HDFC Millennia",
    currency: "INR",
  } as Account;

  it("exports every expense and payment in the cycle window", () => {
    const expenses: Expense[] = [
      {
        id: "e1",
        accountId,
        amount: 100,
        date: "2026-08-01",
        month: "2026-08",
        category: "Food",
        note: "Swiggy",
        createdAt: Date.now(),
      } as Expense,
      {
        id: "e2",
        accountId,
        amount: 200,
        date: "2026-08-10",
        month: "2026-08",
        category: "Travel",
        note: "Uber",
        createdAt: Date.now(),
      } as Expense,
    ];
    const payments: AccountPayment[] = [
      {
        id: "p1",
        toAccountId: accountId,
        amount: 50,
        date: "2026-08-12",
        note: "Payment",
        createdAt: Date.now(),
      } as AccountPayment,
      {
        id: "p2",
        toAccountId: accountId,
        amount: 25,
        date: "2026-08-13",
        note: "Cashback",
        sourceType: "cashback",
        createdAt: Date.now(),
      } as AccountPayment,
    ];

    const exported = buildCreditCardCycleExport({
      account,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-15",
      statementDate: "2026-08-15",
      billId: "bill-1",
      expenses,
      payments,
    });

    expect(exported.totals.rowCount).toBe(4);
    expect(exported.totals.spend).toBe(300);
    expect(exported.totals.userPayments).toBe(50);
    expect(exported.totals.cashback).toBe(25);

    const csv = creditCardCycleExportToCsv(exported);
    expect(csv).toContain("Row count,4");
    expect(csv).toContain("Swiggy");
    expect(csv).toContain("cashback");
    expect(() => assertCycleExportComplete(exported, 4)).not.toThrow();
    expect(() => assertCycleExportComplete(exported, 3)).toThrow(/truncated/);
  });

  it("excludes rows outside the selected cycle", () => {
    const exported = buildCreditCardCycleExport({
      account,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-15",
      statementDate: "2026-08-15",
      expenses: [
        {
          id: "in",
          accountId,
          amount: 10,
          date: "2026-08-10",
          month: "2026-08",
          category: "Food",
          note: "In",
          createdAt: Date.now(),
        } as Expense,
        {
          id: "out",
          accountId,
          amount: 99,
          date: "2026-07-01",
          month: "2026-07",
          category: "Food",
          note: "Out",
          createdAt: Date.now(),
        } as Expense,
      ],
      payments: [],
    });
    expect(exported.totals.rowCount).toBe(1);
    expect(exported.rows[0]?.id).toBe("in");
  });
});
