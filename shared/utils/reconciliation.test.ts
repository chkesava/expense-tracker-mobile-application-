import { describe, it, expect } from "vitest";
import { calculateDashboardSummaries, calculateAccountBalances } from "./reconciliation";
import { borrowingsCreditedTo, repaymentsPaidFrom, receivablesPaidFrom, receivableRepaymentsInto } from "./accountBalance";
import type { Expense, Income, Account } from "../types/expense";
import type { Borrowing, BorrowingRepayment } from "../types/borrowing";
import type { Receivable, ReceivableRepayment } from "../types/receivable";

describe("reconciliation", () => {
  it("calculates dashboard summaries correctly", () => {
    const expenses: Expense[] = [
      { id: "e1", accountId: "a1", amount: 100, date: "2026-10-01", category: "Food" } as Expense,
      { id: "e2", accountId: "a1", amount: 50, date: "2026-10-05", category: "Food" } as Expense,
      { id: "e3", accountId: "a1", amount: 200, date: "2026-10-15", category: "Travel" } as Expense,
      { id: "e4", accountId: "a1", amount: 300, date: "2026-11-01", category: "Food" } as Expense,
      { id: "e5", accountId: "a1", amount: 50, date: "2026-10-20", category: "Food", deletedAt: "now" } as Expense, // deleted
    ];

    const incomes: Income[] = [
      { id: "i1", accountId: "a1", amount: 1000, date: "2026-10-10" } as Income,
      { id: "i2", accountId: "a1", amount: 1000, date: "2026-11-10" } as Income,
      { id: "i3", accountId: "a1", amount: 500, date: "2026-10-15", deletedAt: "now" } as Income, // deleted
    ];

    const dashboards = calculateDashboardSummaries(expenses, incomes);

    expect(dashboards.size).toBe(2);
    
    const oct = dashboards.get("2026-10");
    expect(oct).toBeDefined();
    expect(oct?.totalExpenses).toBe(350);
    expect(oct?.totalIncome).toBe(1000);
    expect(oct?.categoryTotals).toEqual({
      "Food": 150,
      "Travel": 200,
    });
    
    const nov = dashboards.get("2026-11");
    expect(nov).toBeDefined();
    expect(nov?.totalExpenses).toBe(300);
    expect(nov?.totalIncome).toBe(1000);
  });

  it("calculates account balances for a basic bank account", () => {
    const account = { id: "a1", name: "Bank", typeId: "t1" } as Account;
    const incomes = [{ id: "i1", accountId: "a1", amount: 1000, date: "2026-10-01" } as Income];
    const expenses = [{ id: "e1", accountId: "a1", amount: 300, date: "2026-10-05" } as Expense];

    const res = calculateAccountBalances({
      account,
      typeName: "Bank",
      expenses,
      incomes,
      payments: [],
      transfers: [],
      entries: [],
      borrowings: [],
      borrowingRepayments: [],
      receivables: [],
      receivableRepayments: [],
      bills: [],
      today: "2026-10-09"
    });

    expect(res.currentBalance).toBe(700);
  });

  // SPENDLY-436 regression: Borrowing/BorrowingRepayment/Receivable/
  // ReceivableRepayment have no `accountId` field — each relates to an
  // account through its own named field. A rebuild script that filters on
  // `accountId` (the original bug) always gets an empty array here and
  // under-counts the account's true balance.
  it("includes borrowings and receivables matched by their real relation fields, not a generic accountId", () => {
    const account = { id: "a1", name: "Bank", typeId: "t1" } as Account;
    const borrowings: Borrowing[] = [
      {
        id: "b1",
        userId: "u1",
        lenderType: "FRIEND",
        lenderName: "Friend",
        principalAmount: 5000,
        interestRate: 0,
        interestType: "NONE",
        interestFrequency: "NONE",
        interestBasis: "ORIGINAL_PRINCIPAL",
        borrowedDate: "2026-10-01",
        creditedAccountId: "a1",
        status: "ACTIVE",
      } as Borrowing,
    ];
    const borrowingRepayments: BorrowingRepayment[] = [
      {
        id: "br1",
        borrowingId: "b1",
        amount: 1000,
        paymentAccountId: "a1",
        date: "2026-10-05",
      } as BorrowingRepayment,
    ];
    const receivables: Receivable[] = [
      {
        id: "r1",
        userId: "u1",
        personType: "COLLEAGUE",
        personName: "Colleague",
        originalAmount: 2000,
        lentDate: "2026-10-02",
        sourceAccountId: "a1",
        status: "ACTIVE",
      } as Receivable,
    ];
    const receivableRepayments: ReceivableRepayment[] = [
      {
        id: "rr1",
        receivableId: "r1",
        amount: 500,
        receivedAccountId: "a1",
        date: "2026-10-06",
      } as ReceivableRepayment,
    ];

    // Prove the real relation fields, not a generic `accountId`, are what
    // matches these records to the account.
    expect(borrowingsCreditedTo("a1", borrowings)).toHaveLength(1);
    expect(repaymentsPaidFrom("a1", borrowingRepayments)).toHaveLength(1);
    expect(receivablesPaidFrom("a1", receivables)).toHaveLength(1);
    expect(receivableRepaymentsInto("a1", receivableRepayments)).toHaveLength(1);

    const res = calculateAccountBalances({
      account,
      typeName: "Bank",
      expenses: [],
      incomes: [],
      payments: [],
      transfers: [],
      entries: [],
      borrowings,
      borrowingRepayments,
      receivables,
      receivableRepayments,
      bills: [],
      today: "2026-10-09",
    });

    // +5000 borrowed in, -1000 repaid, -2000 lent out, +500 collected back.
    expect(res.currentBalance).toBe(2500);
  });
});
