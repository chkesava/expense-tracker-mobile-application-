import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Account,
  AccountEntry,
  AccountPayment,
  AccountTransfer,
  Expense,
  Income,
} from "@/shared/types/expense";
import {
  buildAccountActivities,
  computeBankBalance,
  computeOutstandingCredit,
  getCreditBillHistory,
  previewBalanceAfterBillPayment,
  previewBalanceAfterTransaction,
} from "./accountBalance";
import { toLocalDateKey } from "./dates";

const mockBank: Account = {
  id: "acc-bank-1",
  name: "HDFC Primary",
  typeId: "type-bank",
  openingBalance: 50000,
  balanceAsOfDate: "2026-08-01",
  currency: "INR",
};

const mockCard: Account = {
  id: "acc-card-1",
  name: "Amazon ICICI",
  typeId: "type-credit",
  creditLimit: 100000,
  billGenerationDay: 15,
  openingBalance: 0,
  currency: "INR",
};

describe("accountActivities and balance utilities", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes bank balance incorporating expenses, incomes, transfers, and manual entries", () => {
    const expenses: Expense[] = [
      {
        id: "exp-1",
        amount: 2500,
        date: "2026-08-02",
        month: "2026-08",
        category: "Food",
        accountId: "acc-bank-1",
        note: "Groceries",
        createdAt: "2026-08-02",
      },
    ];

    const incomes: Income[] = [
      {
        id: "inc-1",
        amount: 15000,
        date: "2026-08-03",
        month: "2026-08",
        source: "Freelance",
        accountId: "acc-bank-1",
        note: "Consulting",
        createdAt: "2026-08-03",
      },
    ];

    const transfers: AccountTransfer[] = [
      {
        id: "tr-1",
        fromAccountId: "acc-bank-1",
        toAccountId: "acc-bank-2",
        amount: 5000,
        date: "2026-08-04",
      },
    ];

    const entries: AccountEntry[] = [
      {
        id: "entry-1",
        accountId: "acc-bank-1",
        amount: 350,
        direction: "credit",
        date: "2026-08-05",
        note: "Bank interest",
      },
    ];

    const balance = computeBankBalance(
      mockBank,
      expenses,
      incomes,
      [],
      entries,
      transfers
    );

    // 50000 (opening) + 15000 (income) - 2500 (expense) - 5000 (transfer out) + 350 (credit entry) = 57850
    expect(balance).toBe(57850);
  });

  it("ignores ledger rows before balanceAsOfDate for bank accounts", () => {
    const expenses: Expense[] = [
      {
        id: "old",
        amount: 9999,
        date: "2026-07-31",
        month: "2026-07",
        category: "Food",
        accountId: "acc-bank-1",
        note: "Before baseline",
        createdAt: "2026-07-31",
      },
      {
        id: "new",
        amount: 100,
        date: "2026-08-01",
        month: "2026-08",
        category: "Food",
        accountId: "acc-bank-1",
        note: "On baseline",
        createdAt: "2026-08-01",
      },
    ];

    expect(computeBankBalance(mockBank, expenses, [])).toBe(49900);
  });

  it("still shows yesterday's transactions after an accidental today baseline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 21, 12, 0, 0));

    const rebased: Account = {
      ...mockBank,
      openingBalance: 1000,
      balanceAsOfDate: "2026-08-21",
    };
    const expenses: Expense[] = [
      {
        id: "yesterday",
        amount: 200,
        date: "2026-08-20",
        month: "2026-08",
        category: "Food",
        accountId: "acc-bank-1",
        note: "Dinner",
        createdAt: "2026-08-20",
      },
      {
        id: "today",
        amount: 50,
        date: "2026-08-21",
        month: "2026-08",
        category: "Food",
        accountId: "acc-bank-1",
        note: "Coffee",
        createdAt: "2026-08-21",
      },
    ];

    expect(computeBankBalance(rebased, expenses, [])).toBe(750);
    const activities = buildAccountActivities(rebased, "Bank Account", expenses, []);
    expect(activities.map((row) => row.id).sort()).toEqual(["today", "yesterday"].sort());
  });

  it("builds account activities with correct credit/debit types and counterparty names", () => {
    const expenses: Expense[] = [
      {
        id: "exp-1",
        amount: 1200,
        date: "2026-08-02",
        month: "2026-08",
        category: "Dining",
        accountId: "acc-bank-1",
        note: "Dinner",
        createdAt: "2026-08-02",
      },
    ];

    const transfers: AccountTransfer[] = [
      {
        id: "tr-1",
        fromAccountId: "acc-bank-1",
        toAccountId: "acc-bank-2",
        amount: 3000,
        date: "2026-08-03",
        note: "Transfer to Savings",
      },
    ];

    const accountNameById = {
      "acc-bank-1": "HDFC Primary",
      "acc-bank-2": "SBI Savings",
    };

    const activities = buildAccountActivities(
      mockBank,
      "Bank Account",
      expenses,
      [],
      [],
      [],
      transfers,
      accountNameById
    );

    expect(activities.length).toBe(2);

    const expAct = activities.find((a) => a.id === "exp-1");
    expect(expAct).toBeDefined();
    expect(expAct?.type).toBe("debit");
    expect(expAct?.amount).toBe(1200);

    const trAct = activities.find((a) => a.id === "transfer-out-tr-1");
    expect(trAct).toBeDefined();
    expect(trAct?.type).toBe("debit");
    expect(trAct?.counterpartyName).toBe("SBI Savings");
  });

  it("computes credit card cycle usage and available credit with frozen bill cycle", () => {
    vi.useFakeTimers();
    // Mid-cycle: 10 Aug, bill day 15 → open window [16 Jul, 15 Aug]
    vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0));

    const expenses: Expense[] = [
      {
        id: "exp-c1",
        amount: 8000,
        date: "2026-08-02",
        month: "2026-08",
        category: "Electronics",
        accountId: "acc-card-1",
        note: "Headphones",
        createdAt: "2026-08-02",
      },
      {
        id: "exp-outside",
        amount: 5000,
        date: "2026-07-14",
        month: "2026-07",
        category: "Electronics",
        accountId: "acc-card-1",
        note: "Prior cycle",
        createdAt: "2026-07-14",
      },
    ];

    const payments: AccountPayment[] = [
      {
        id: "pay-partial",
        fromAccountId: "acc-bank-1",
        toAccountId: "acc-card-1",
        amount: 2000,
        date: "2026-08-05",
      },
    ];

    const usage = computeOutstandingCredit(mockCard, expenses, payments);

    // Cycle usage is this-cycle spend only. The 5,000 charged on 14 Jul belongs
    // to the statement that closed on 15 Jul, and the 2,000 paid on 5 Aug
    // settles that statement rather than shrinking this cycle.
    expect(usage.usedThisCycle).toBe(8000);
    expect(usage.paidThisCycle).toBe(2000);
    expect(usage.availableCredit).toBe(92000);
    expect(usage.statementDue).toBe(3000);
    expect(usage.totalOutstanding).toBe(11000);
    expect(toLocalDateKey(usage.nextResetDate)).toBe("2026-08-15");
    expect(usage.daysRemaining).toBe(5);
  });

  it("reports every payment landing in the open window, whichever statement it settles", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0));

    const expenses: Expense[] = [
      {
        id: "exp-c1",
        amount: 5000,
        date: "2026-08-01",
        month: "2026-08",
        category: "Shopping",
        accountId: "acc-card-1",
        note: "Cart",
        createdAt: "2026-08-01",
      },
    ];

    const payments: AccountPayment[] = [
      {
        id: "for-last-statement",
        fromAccountId: "acc-bank-1",
        toAccountId: "acc-card-1",
        amount: 5000,
        date: "2026-08-05",
      },
      {
        id: "external-top-up",
        fromAccountId: "external",
        toAccountId: "acc-card-1",
        amount: 1500,
        date: "2026-08-06",
        sourceType: "external",
      },
    ];

    const usage = computeOutstandingCredit(mockCard, expenses, payments);
    // Both land in the open window, external included.
    expect(usage.paidThisCycle).toBe(6500);
    // 6,500 paid against 5,000 of open-cycle spend clears the cycle and leaves
    // 1,500 of credit on the card, so the limit is fully restored.
    expect(usage.usedThisCycle).toBe(0);
    expect(usage.availableCredit).toBe(100000);
    expect(usage.unappliedCredit).toBe(1500);
  });

  it("evaluates credit card bill history status across cycles", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 20, 12, 0, 0)); // after Aug 15 bill

    const expenses: Expense[] = [
      {
        id: "exp-paid",
        amount: 4000,
        date: "2026-07-02",
        month: "2026-07",
        category: "Travel",
        accountId: "acc-card-1",
        note: "Flight",
        createdAt: "2026-07-02",
      },
      {
        id: "exp-partial",
        amount: 3000,
        date: "2026-07-20",
        month: "2026-07",
        category: "Travel",
        accountId: "acc-card-1",
        note: "Hotel",
        createdAt: "2026-07-20",
      },
    ];

    const payments: AccountPayment[] = [
      // Settles the statement that closed on 15 Jul.
      {
        id: "pay-full",
        fromAccountId: "acc-bank-1",
        toAccountId: "acc-card-1",
        amount: 4000,
        date: "2026-07-16",
      },
      // Part payment toward the statement that closed on 15 Aug.
      {
        id: "pay-partial",
        fromAccountId: "acc-bank-1",
        toAccountId: "acc-card-1",
        amount: 1000,
        date: "2026-08-16",
      },
    ];

    const history = getCreditBillHistory(mockCard, expenses, payments, 3);
    expect(history.length).toBeGreaterThanOrEqual(2);

    const paidCycle = history.find((h) => h.billedAmount === 4000);
    expect(paidCycle?.status).toBe("paid");
    expect(paidCycle?.outstandingAmount).toBe(0);

    const partialCycle = history.find((h) => h.billedAmount === 3000);
    expect(partialCycle?.status).toBe("partiallyPaid");
    expect(partialCycle?.outstandingAmount).toBe(2000);
  });

  it("previews bank balance after a new expense and after a bill payment", () => {
    const previewExpense = previewBalanceAfterTransaction(
      mockBank,
      "Bank",
      [],
      [],
      "expense",
      500,
      [],
      [],
      []
    );
    expect(previewExpense).toBe(49500);

    const previewPay = previewBalanceAfterBillPayment(
      mockBank,
      [],
      [],
      [],
      [],
      [],
      1200
    );
    expect(previewPay).toBe(48800);
  });
});
