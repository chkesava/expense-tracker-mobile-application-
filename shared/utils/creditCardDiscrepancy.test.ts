import { describe, expect, it } from "vitest";
import { buildSettledStatementDiscrepancyReport } from "./creditCardDiscrepancy";
import { buildCreditCardLedger } from "./creditCardLedger";
import type { Account, Expense, AccountPayment } from "../types/expense";
import type { LedgerBillSlice } from "./creditCardLedger";

describe("buildSettledStatementDiscrepancyReport", () => {
  const account = {
    id: "card_1",
    name: "Test Card",
    typeId: "credit_type",
    currency: "INR",
    createdAt: Date.now(),
    creditLimit: 50000,
    billGenerationDay: 5,
  } as Account;

  const createExpense = (id: string, amount: number, date: string): Expense => ({
    id,
    accountId: account.id,
    amount,
    date,
    category: "Food",
    month: date.substring(0, 7),
    note: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as Expense);

  it("returns no discrepancies when history matches billed amount", () => {
    const expenses = [createExpense("e1", 1000, "2026-08-10")];
    const payments: AccountPayment[] = [
      { id: "p1", amount: 1000, date: "2026-09-08", toAccountId: account.id, fromAccountId: "bank_1", sourceType: "account" } as AccountPayment
    ];
    const bills: LedgerBillSlice[] = [
      {
        id: "bill_1",
        accountId: account.id,
        statementDate: "2026-09-05",
        billingPeriodStart: "2026-08-06",
        billingPeriodEnd: "2026-09-05",
        statementAmount: 1000,
        amountPaid: 1000,
        status: "PAID",
      }
    ];

    const ledger = buildCreditCardLedger({ account, expenses, payments, bills, today: "2026-09-10" });
    const report = buildSettledStatementDiscrepancyReport({ account, expenses, bills, ledger });

    expect(report.discrepancies).toHaveLength(0);
  });

  it("flags a discrepancy if historical spend was modified after settlement", () => {
    // Statement says 1000, but expenses sum to 800 (maybe 200 was deleted)
    const expenses = [createExpense("e1", 800, "2026-08-10")];
    const payments: AccountPayment[] = [
      { id: "p1", amount: 1000, date: "2026-09-08", toAccountId: account.id, fromAccountId: "bank_1", sourceType: "account" } as AccountPayment
    ];
    const bills: LedgerBillSlice[] = [
      {
        id: "bill_1",
        accountId: account.id,
        statementDate: "2026-09-05",
        billingPeriodStart: "2026-08-06",
        billingPeriodEnd: "2026-09-05",
        statementAmount: 1000,
        amountPaid: 1000,
        status: "PAID",
      }
    ];

    const ledger = buildCreditCardLedger({ account, expenses, payments, bills, today: "2026-09-10" });
    const report = buildSettledStatementDiscrepancyReport({ account, expenses, bills, ledger });

    expect(report.discrepancies).toHaveLength(1);
    expect(report.discrepancies[0]).toEqual({
      billId: "bill_1",
      statementDate: "2026-09-05",
      periodStart: "2026-08-06",
      periodEnd: "2026-09-05",
      billedAmount: 1000,
      historyAmount: 800,
      discrepancyAmount: 200, // 1000 - 800
      status: "PAID",
    });
  });

  it("ignores non-PAID statements", () => {
    // UNPAID statement has discrepancy, but we only report on settled ones
    const expenses = [createExpense("e1", 800, "2026-08-10")];
    const bills: LedgerBillSlice[] = [
      {
        id: "bill_1",
        accountId: account.id,
        statementDate: "2026-09-05",
        billingPeriodStart: "2026-08-06",
        billingPeriodEnd: "2026-09-05",
        statementAmount: 1000,
        amountPaid: 0,
        status: "OVERDUE",
      }
    ];

    const ledger = buildCreditCardLedger({ account, expenses, payments: [], bills, today: "2026-09-10" });
    const report = buildSettledStatementDiscrepancyReport({ account, expenses, bills, ledger });

    expect(report.discrepancies).toHaveLength(0);
  });
});
