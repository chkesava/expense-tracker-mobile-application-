import { beforeEach, describe, expect, it } from "vitest";
import type { Account } from "@/shared/types/expense";
import {
  buildAccountActivities,
  computeBankBalance,
} from "@/shared/utils/accountBalance";
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
