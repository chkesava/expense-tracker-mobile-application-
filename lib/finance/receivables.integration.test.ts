import { beforeEach, describe, expect, it } from "vitest";
import type { Account } from "@/shared/types/expense";
import {
  buildAccountActivities,
  computeBankBalance,
} from "@/shared/utils/accountBalance";
import { summarizeBorrowings } from "@/shared/utils/borrowingMath";
import { summarizeReceivables } from "@/shared/utils/receivableMath";
import { createMemoryLedger, resetMemoryLedgerIds } from "./memoryLedger";

const bank: Account = {
  id: "hdfc",
  name: "HDFC",
  typeId: "bank",
  openingBalance: 50000,
  balanceAsOfDate: "2026-01-01",
};

describe("receivable lifecycle end to end", () => {
  beforeEach(() => {
    resetMemoryLedgerIds();
  });

  it("debits the account without creating an expense, then settles", () => {
    const ledger = createMemoryLedger("user-1");
    const account = ledger.addAccount(bank);

    const receivable = ledger.addReceivable({
      personType: "FRIEND",
      personName: "Rahul",
      originalAmount: 20000,
      lentDate: "2026-01-10",
      sourceAccountId: account.id!,
      status: "ACTIVE",
    });

    expect(ledger.listExpenses()).toHaveLength(0);
    expect(ledger.listIncomes()).toHaveLength(0);

    expect(
      computeBankBalance(
        account,
        ledger.listExpenses(),
        ledger.listIncomes(),
        [],
        [],
        [],
        [],
        [],
        ledger.listReceivables(),
        ledger.listReceivableRepayments()
      )
    ).toBe(30000);

    const partial = ledger.addReceivableRepayment({
      receivableId: receivable.id!,
      amount: 10000,
      receivedAccountId: account.id!,
      date: "2026-02-10",
    });
    expect(partial.ok).toBe(true);
    expect(ledger.listReceivables()[0].status).toBe("PARTIALLY_SETTLED");
    expect(ledger.listReceivables()[0].outstandingAmount).toBe(10000);

    const final = ledger.addReceivableRepayment({
      receivableId: receivable.id!,
      amount: 10000,
      receivedAccountId: account.id!,
      date: "2026-03-10",
    });
    expect(final.ok).toBe(true);
    expect(ledger.listReceivables()[0].status).toBe("FULLY_SETTLED");
    expect(ledger.listReceivables()[0].outstandingAmount).toBe(0);

    expect(
      computeBankBalance(
        account,
        ledger.listExpenses(),
        ledger.listIncomes(),
        [],
        [],
        [],
        [],
        [],
        ledger.listReceivables(),
        ledger.listReceivableRepayments()
      )
    ).toBe(50000);

    expect(ledger.listExpenses()).toHaveLength(0);
    expect(ledger.listIncomes()).toHaveLength(0);
  });

  it("rejects overpayment and leaves the receivable untouched", () => {
    const ledger = createMemoryLedger("user-1");
    const receivable = ledger.addReceivable({
      personType: "FAMILY",
      personName: "Anjali",
      originalAmount: 5000,
      lentDate: "2026-01-01",
      sourceAccountId: "acc-1",
      status: "ACTIVE",
    });

    const result = ledger.addReceivableRepayment({
      receivableId: receivable.id!,
      amount: 5001,
      date: "2026-02-01",
    });

    expect(result.ok).toBe(false);
    expect(ledger.listReceivableRepayments()).toHaveLength(0);
    expect(ledger.listReceivables()[0].outstandingAmount).toBe(5000);
  });

  it("keeps net assets stable when cash moves into a receivable", () => {
    const ledger = createMemoryLedger("user-1");
    const account = ledger.addAccount(bank);

    ledger.addReceivable({
      personType: "FRIEND",
      personName: "Rahul",
      originalAmount: 20000,
      lentDate: "2026-01-10",
      sourceAccountId: account.id!,
      status: "ACTIVE",
    });

    const cash = computeBankBalance(
      account,
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      ledger.listReceivables(),
      ledger.listReceivableRepayments()
    );
    const portfolio = summarizeReceivables(
      ledger.listReceivables(),
      ledger.listReceivableRepayments(),
      "2026-01-10"
    );

    // Cash 30000 + receivable asset 20000 = original 50000.
    expect(cash + portfolio.totalOutstanding).toBe(50000);
  });

  it("shows lend and collection rows in the account feed", () => {
    const ledger = createMemoryLedger("user-1");
    const account = ledger.addAccount(bank);

    const receivable = ledger.addReceivable({
      personType: "FRIEND",
      personName: "Rahul",
      originalAmount: 20000,
      lentDate: "2026-01-10",
      sourceAccountId: account.id!,
      status: "ACTIVE",
    });
    ledger.addReceivableRepayment({
      receivableId: receivable.id!,
      amount: 5000,
      receivedAccountId: account.id!,
      date: "2026-02-10",
    });

    const activities = buildAccountActivities(
      account,
      "Bank",
      [],
      [],
      [],
      [],
      [],
      undefined,
      undefined,
      {
        receivables: ledger.listReceivables(),
        receivableRepayments: ledger.listReceivableRepayments(),
      }
    );

    const lend = activities.find((a) => a.isReceivable);
    const collect = activities.find((a) => a.isReceivableRepayment);
    expect(lend?.type).toBe("debit");
    expect(lend?.amount).toBe(20000);
    expect(collect?.type).toBe("credit");
    expect(collect?.amount).toBe(5000);
  });

  it("cascades repayment deletion when the receivable is deleted", () => {
    const ledger = createMemoryLedger("user-1");
    const keep = ledger.addReceivable({
      personType: "FRIEND",
      personName: "Keep",
      originalAmount: 3000,
      lentDate: "2026-01-01",
      sourceAccountId: "a",
      status: "ACTIVE",
    });
    const drop = ledger.addReceivable({
      personType: "OTHER",
      personName: "Drop",
      originalAmount: 2000,
      lentDate: "2026-01-01",
      sourceAccountId: "a",
      status: "ACTIVE",
    });

    ledger.addReceivableRepayment({
      receivableId: keep.id!,
      amount: 500,
      date: "2026-02-01",
    });
    ledger.addReceivableRepayment({
      receivableId: drop.id!,
      amount: 700,
      date: "2026-02-01",
    });

    expect(ledger.deleteReceivable(drop.id!)).toBe(true);
    expect(ledger.listReceivables()).toHaveLength(1);
    expect(ledger.listReceivableRepayments()).toHaveLength(1);
    expect(ledger.listReceivableRepayments()[0].receivableId).toBe(keep.id);
  });
});

describe("SPENDLY-160 — an interest-bearing lend end to end", () => {
  beforeEach(() => {
    resetMemoryLedgerIds();
  });

  /** 20000 lent on 2026-01-10 at 1% monthly on the outstanding principal. */
  function lendWithInterest(ledger: ReturnType<typeof createMemoryLedger>) {
    const account = ledger.addAccount(bank);
    const receivable = ledger.addReceivable({
      personType: "CUSTOMER",
      personName: "Meera",
      originalAmount: 20000,
      lentDate: "2026-01-10",
      sourceAccountId: account.id!,
      status: "ACTIVE",
      interestRate: 1,
      interestType: "SIMPLE",
      interestFrequency: "MONTHLY",
      interestBasis: "OUTSTANDING_PRINCIPAL",
    });
    return { account, receivable };
  }

  it("moves only the principal out of the account", () => {
    // Accrued interest was never cash and must never touch a bank balance.
    const ledger = createMemoryLedger("user-1");
    const { account } = lendWithInterest(ledger);

    const balance = computeBankBalance(
      account,
      ledger.listExpenses(),
      ledger.listIncomes(),
      [],
      [],
      [],
      [],
      [],
      ledger.listReceivables(),
      ledger.listReceivableRepayments()
    );

    expect(balance).toBe(30000);
  });

  it("clears interest before principal and records the split", () => {
    const ledger = createMemoryLedger("user-1");
    const { account, receivable } = lendWithInterest(ledger);

    // Two months in, 400 of interest has accrued on 20000.
    const result = ledger.addReceivableRepayment({
      receivableId: receivable.id!,
      amount: 1000,
      receivedAccountId: account.id!,
      date: "2026-03-10",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.repayment.interestComponent).toBe(400);
    expect(result.repayment.principalComponent).toBe(600);
  });

  it("mirrors accrued interest onto the stored receivable", () => {
    const ledger = createMemoryLedger("user-1");
    const { receivable } = lendWithInterest(ledger);

    ledger.addReceivableRepayment({
      receivableId: receivable.id!,
      amount: 1000,
      date: "2026-03-10",
    });

    const stored = ledger
      .listReceivables()
      .find((r) => r.id === receivable.id)!;

    expect(stored.accruedInterest).toBe(400);
    expect(stored.outstandingAmount).toBe(19400);
  });

  it("counts the interest collected as cash, unlike the interest accrued", () => {
    const ledger = createMemoryLedger("user-1");
    const { account, receivable } = lendWithInterest(ledger);

    ledger.addReceivableRepayment({
      receivableId: receivable.id!,
      amount: 1000,
      receivedAccountId: account.id!,
      date: "2026-03-10",
    });

    const balance = computeBankBalance(
      account,
      ledger.listExpenses(),
      ledger.listIncomes(),
      [],
      [],
      [],
      [],
      [],
      ledger.listReceivables(),
      ledger.listReceivableRepayments()
    );

    // 50000 out 20000, back the full 1000 received — interest included, because
    // that money really did arrive.
    expect(balance).toBe(31000);
  });

  it("keeps the receivable open while only interest is owed", () => {
    const ledger = createMemoryLedger("user-1");
    const { receivable } = lendWithInterest(ledger);

    ledger.addReceivableRepayment({
      receivableId: receivable.id!,
      amount: 20000,
      date: "2026-02-10",
    });

    const portfolio = summarizeReceivables(
      ledger.listReceivables(),
      ledger.listReceivableRepayments(),
      "2026-03-10"
    );

    expect(portfolio.totalOutstanding).toBeGreaterThan(0);
    expect(portfolio.settledCount).toBe(0);
  });
});

describe("SPENDLY-160 — lending and borrowing stay symmetric in net worth", () => {
  beforeEach(() => {
    resetMemoryLedgerIds();
  });

  it("cancels out when the same money is lent and borrowed on the same terms", () => {
    // `netWorth.ts` books borrowing `totalOutstanding` as a liability and
    // receivable `totalOutstanding` as an asset. The borrowing side has always
    // included accrued interest; SPENDLY-160 made the receivable side match. If
    // it ever stops matching, these two figures diverge and net worth drifts by
    // the interest on every matched pair.
    const ledger = createMemoryLedger("user-1");
    const account = ledger.addAccount(bank);

    const terms = {
      interestRate: 1,
      interestType: "SIMPLE" as const,
      interestFrequency: "MONTHLY" as const,
      interestBasis: "OUTSTANDING_PRINCIPAL" as const,
    };

    ledger.addReceivable({
      personType: "FRIEND",
      personName: "Rahul",
      originalAmount: 20000,
      lentDate: "2026-01-10",
      sourceAccountId: account.id!,
      status: "ACTIVE",
      ...terms,
    });

    ledger.addBorrowing({
      lenderType: "FRIEND",
      lenderName: "Anita",
      principalAmount: 20000,
      borrowedDate: "2026-01-10",
      creditedAccountId: account.id!,
      status: "ACTIVE",
      ...terms,
    });

    const receivableOutstanding = summarizeReceivables(
      ledger.listReceivables(),
      ledger.listReceivableRepayments(),
      "2026-04-10"
    ).totalOutstanding;

    const borrowingOutstanding = summarizeBorrowings(
      ledger.listBorrowings(),
      ledger.listRepayments(),
      "2026-04-10"
    ).totalOutstanding;

    // 20000 principal plus 600 of interest on each side.
    expect(receivableOutstanding).toBe(20600);
    expect(receivableOutstanding).toBe(borrowingOutstanding);
  });
});
