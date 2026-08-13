import { beforeEach, describe, expect, it } from "vitest";
import type { Account } from "@/shared/types/expense";
import {
  buildAccountActivities,
  computeBankBalance,
} from "@/shared/utils/accountBalance";
import { summarizeBorrowings } from "@/shared/utils/borrowingMath";
import { createMemoryLedger, resetMemoryLedgerIds } from "./memoryLedger";

const bank: Account = {
  id: "hdfc",
  name: "HDFC",
  typeId: "bank",
  openingBalance: 1000,
  balanceAsOfDate: "2026-01-01",
};

describe("borrowing lifecycle end to end", () => {
  beforeEach(() => {
    resetMemoryLedgerIds();
  });

  it("credits the account without creating income, then settles fully", () => {
    const ledger = createMemoryLedger("user-1");
    const account = ledger.addAccount(bank);

    const borrowing = ledger.addBorrowing({
      lenderType: "FRIEND",
      lenderName: "Ravi",
      principalAmount: 20000,
      interestRate: 0,
      interestType: "NONE",
      interestFrequency: "NONE",
      interestBasis: "OUTSTANDING_PRINCIPAL",
      borrowedDate: "2026-01-10",
      creditedAccountId: account.id,
      status: "ACTIVE",
    });

    // The single most important guarantee: borrowed money is a liability, so
    // no income document exists for any income report to pick up.
    expect(ledger.listIncomes()).toHaveLength(0);

    expect(
      computeBankBalance(
        account,
        ledger.listExpenses(),
        ledger.listIncomes(),
        [],
        [],
        [],
        ledger.listBorrowings(),
        ledger.listRepayments()
      )
    ).toBe(21000);

    const partial = ledger.addRepayment({
      borrowingId: borrowing.id!,
      amount: 8000,
      paymentAccountId: account.id,
      date: "2026-02-10",
    });
    expect(partial.ok).toBe(true);

    expect(ledger.listBorrowings()[0].status).toBe("PARTIALLY_SETTLED");
    expect(ledger.listBorrowings()[0].totalOutstanding).toBe(12000);

    const final = ledger.addRepayment({
      borrowingId: borrowing.id!,
      amount: 12000,
      paymentAccountId: account.id,
      date: "2026-03-10",
    });
    expect(final.ok).toBe(true);

    const settled = ledger.listBorrowings()[0];
    expect(settled.status).toBe("FULLY_SETTLED");
    expect(settled.totalOutstanding).toBe(0);
    expect(settled.settledDate).toBe("2026-03-10");

    // Credit in, both repayments out — back to the opening balance.
    expect(
      computeBankBalance(
        account,
        ledger.listExpenses(),
        ledger.listIncomes(),
        [],
        [],
        [],
        ledger.listBorrowings(),
        ledger.listRepayments()
      )
    ).toBe(1000);

    // And still no repayment ever became an ordinary expense.
    expect(ledger.listExpenses()).toHaveLength(0);
  });

  it("rejects an overpayment and leaves the borrowing untouched", () => {
    const ledger = createMemoryLedger("user-1");
    const borrowing = ledger.addBorrowing({
      lenderType: "BANK",
      lenderName: "SBI",
      principalAmount: 5000,
      interestRate: 0,
      interestType: "NONE",
      interestFrequency: "NONE",
      interestBasis: "OUTSTANDING_PRINCIPAL",
      borrowedDate: "2026-01-01",
      status: "ACTIVE",
    });

    const result = ledger.addRepayment({
      borrowingId: borrowing.id!,
      amount: 5001,
      date: "2026-02-01",
    });

    expect(result.ok).toBe(false);
    expect(ledger.listRepayments()).toHaveLength(0);
    expect(ledger.listBorrowings()[0].totalOutstanding).toBe(5000);
  });

  it("clears accrued interest before principal on an interest-bearing loan", () => {
    const ledger = createMemoryLedger("user-1");
    const borrowing = ledger.addBorrowing({
      lenderType: "FINANCE_INSTITUTION",
      lenderName: "Bajaj",
      principalAmount: 10000,
      interestRate: 1,
      interestType: "SIMPLE",
      interestFrequency: "MONTHLY",
      interestBasis: "OUTSTANDING_PRINCIPAL",
      borrowedDate: "2026-01-01",
      status: "ACTIVE",
    });

    // Two months at 1% of 10000 = 200 interest owed alongside the principal.
    const paid = ledger.addRepayment({
      borrowingId: borrowing.id!,
      amount: 1200,
      date: "2026-03-01",
    });

    expect(paid.ok).toBe(true);
    if (!paid.ok) return;
    expect(paid.repayment.interestComponent).toBe(200);
    expect(paid.repayment.principalComponent).toBe(1000);
    expect(ledger.listBorrowings()[0].outstandingPrincipal).toBe(9000);
  });

  it("cascades repayment deletion when the borrowing is deleted", () => {
    const ledger = createMemoryLedger("user-1");
    const keep = ledger.addBorrowing({
      lenderType: "FAMILY",
      lenderName: "Amma",
      principalAmount: 3000,
      interestRate: 0,
      interestType: "NONE",
      interestFrequency: "NONE",
      interestBasis: "OUTSTANDING_PRINCIPAL",
      borrowedDate: "2026-01-01",
      status: "ACTIVE",
    });
    const drop = ledger.addBorrowing({
      lenderType: "OTHER",
      lenderName: "Colleague",
      principalAmount: 2000,
      interestRate: 0,
      interestType: "NONE",
      interestFrequency: "NONE",
      interestBasis: "OUTSTANDING_PRINCIPAL",
      borrowedDate: "2026-01-01",
      status: "ACTIVE",
    });

    ledger.addRepayment({
      borrowingId: keep.id!,
      amount: 500,
      date: "2026-02-01",
    });
    ledger.addRepayment({
      borrowingId: drop.id!,
      amount: 700,
      date: "2026-02-01",
    });

    expect(ledger.deleteBorrowing(drop.id!)).toBe(true);
    expect(ledger.listBorrowings()).toHaveLength(1);
    expect(ledger.listRepayments()).toHaveLength(1);
    expect(ledger.listRepayments()[0].borrowingId).toBe(keep.id);
  });

  it("reports portfolio totals and shows repayments in the account feed", () => {
    const ledger = createMemoryLedger("user-1");
    const account = ledger.addAccount(bank);

    const borrowing = ledger.addBorrowing({
      lenderType: "FRIEND",
      lenderName: "Ravi",
      principalAmount: 20000,
      interestRate: 0,
      interestType: "NONE",
      interestFrequency: "NONE",
      interestBasis: "OUTSTANDING_PRINCIPAL",
      borrowedDate: "2026-01-10",
      creditedAccountId: account.id,
      status: "ACTIVE",
    });
    ledger.addRepayment({
      borrowingId: borrowing.id!,
      amount: 5000,
      paymentAccountId: account.id,
      date: "2026-02-10",
    });

    const portfolio = summarizeBorrowings(
      ledger.listBorrowings(),
      ledger.listRepayments(),
      "2026-03-01"
    );
    expect(portfolio.totalBorrowed).toBe(20000);
    expect(portfolio.totalRepaid).toBe(5000);
    expect(portfolio.totalOutstanding).toBe(15000);
    expect(portfolio.activeCount).toBe(1);

    const activities = buildAccountActivities(
      account,
      "Bank",
      ledger.listExpenses(),
      ledger.listIncomes(),
      [],
      [],
      [],
      undefined,
      {
        borrowings: ledger.listBorrowings(),
        borrowingRepayments: ledger.listRepayments(),
      }
    );

    // A repayment row carries both link ids, so match on the repayment one.
    const credit = activities.find((a) => a.isBorrowing);
    const debit = activities.find((a) => a.linkedRepaymentId);
    expect(credit?.linkedBorrowingId).toBe(borrowing.id);
    expect(debit?.linkedBorrowingId).toBe(borrowing.id);
    expect(credit?.type).toBe("credit");
    expect(credit?.amount).toBe(20000);
    expect(credit?.isBorrowing).toBe(true);
    expect(debit?.type).toBe("debit");
    expect(debit?.amount).toBe(5000);
    expect(debit?.isLoanRepayment).toBe(true);
  });
});
