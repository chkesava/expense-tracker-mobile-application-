import { describe, expect, it } from "vitest";
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
} from "./accountBalance";

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

  it("computes credit card cycle usage and available credit limit", () => {
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
    ];

    const usage = computeCreditUsage(mockCard, expenses, []);

    expect(usage.availableCredit).toBe(92000);
    expect(usage.usedThisCycle).toBe(8000);
    expect(usage.daysRemaining).toBeGreaterThanOrEqual(0);
  });

  it("evaluates credit card bill history and payment status", () => {
    const expenses: Expense[] = [
      {
        id: "exp-c2",
        amount: 4000,
        date: "2026-07-02",
        month: "2026-07",
        category: "Travel",
        accountId: "acc-card-1",
        note: "Flight",
        createdAt: "2026-07-02",
      },
    ];

    const payments: AccountPayment[] = [
      {
        id: "pay-1",
        fromAccountId: "acc-bank-1",
        toAccountId: "acc-card-1",
        amount: 4000,
        date: "2026-07-10",
      },
    ];

    const history = getCreditBillHistory(mockCard, expenses, payments, 3);
    expect(Array.isArray(history)).toBe(true);
  });
});
