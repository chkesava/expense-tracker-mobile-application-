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
  computeCreditUsage,
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
    // Mid-cycle: 10 Aug, bill day 15 → cycle [15 Jul, 15 Aug)
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
        appliedCycleStart: "2026-07-15",
        appliedCycleEnd: "2026-08-15",
      },
    ];

    const usage = computeCreditUsage(mockCard, expenses, payments);

    expect(usage.usedThisCycle).toBe(6000);
    expect(usage.paidThisCycle).toBe(2000);
    expect(usage.availableCredit).toBe(94000);
    expect(toLocalDateKey(usage.nextResetDate)).toBe("2026-08-15");
    expect(usage.daysRemaining).toBe(5);
  });

  it("matches cycle payments via structured appliedCycle fields over note parsing", () => {
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
        id: "wrong-cycle",
        fromAccountId: "acc-bank-1",
        toAccountId: "acc-card-1",
        amount: 5000,
        date: "2026-08-05",
        appliedCycleStart: "2026-06-15",
        appliedCycleEnd: "2026-07-15",
      },
      {
        id: "right-cycle",
        fromAccountId: "external",
        toAccountId: "acc-card-1",
        amount: 1500,
        date: "2026-08-06",
        sourceType: "external",
        appliedCycleStart: "2026-07-15",
        appliedCycleEnd: "2026-08-15",
      },
    ];

    const usage = computeCreditUsage(mockCard, expenses, payments);
    expect(usage.paidThisCycle).toBe(1500);
    expect(usage.usedThisCycle).toBe(3500);
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
      {
        id: "pay-full",
        fromAccountId: "acc-bank-1",
        toAccountId: "acc-card-1",
        amount: 4000,
        date: "2026-07-10",
        appliedCycleStart: "2026-06-15",
        appliedCycleEnd: "2026-07-15",
      },
      {
        id: "pay-partial",
        fromAccountId: "acc-bank-1",
        toAccountId: "acc-card-1",
        amount: 1000,
        date: "2026-08-01",
        appliedCycleStart: "2026-07-15",
        appliedCycleEnd: "2026-08-15",
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
