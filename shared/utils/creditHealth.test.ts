import { describe, expect, it } from "vitest";
import { computeOutstandingCredit, type OpenCreditBillSlice } from "./accountBalance";
import type { Account, Expense, AccountPayment } from "../types/expense";

describe("creditHealth / computeOutstandingCredit", () => {
  const account: Account = {
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

  it("calculates utilization correctly (partial usage)", () => {
    // Current cycle starts Sep 6 (since today is Sep 10 and bill day is 5)
    // Actually, if today is Sep 10, previous bill generation was Sep 5, so open cycle is Sep 6 - Oct 5
    const expenses = [
      createExpense("e1", 10000, "2026-09-08"),
    ];

    const result = computeOutstandingCredit(account, expenses, [], [], "2026-09-10");
    
    expect(result.unbilledSpend).toBe(10000);
    expect(result.totalOutstanding).toBe(10000);
    expect(result.availableCredit).toBe(40000);
    // 10000 / 50000 = 20%
  });

  it("handles zero/missing credit limit safely", () => {
    const noLimitAccount = { ...account, creditLimit: 0 };
    const expenses = [
      createExpense("e1", 10000, "2026-09-08"),
    ];

    const result = computeOutstandingCredit(noLimitAccount, expenses, [], [], "2026-09-10");
    
    expect(result.unbilledSpend).toBe(10000);
    expect(result.totalOutstanding).toBe(10000);
    expect(result.availableCredit).toBe(0); // Safely returns 0 when no limit
  });

  it("distinguishes unbilled liability from statement liability", () => {
    // Expense in previous cycle (billed)
    const expenses = [
      createExpense("e1", 20000, "2026-08-10"),
      createExpense("e2", 5000, "2026-09-08"), // Unbilled
    ];

    const bills: OpenCreditBillSlice[] = [
      {
        id: "bill_1",
        accountId: account.id,
        statementDate: "2026-09-05",
        billingPeriodStart: "2026-08-06",
        billingPeriodEnd: "2026-09-05",
        statementAmount: 20000,
        amountPaid: 0,
        remainingAmount: 20000,
        status: "OVERDUE",
      }
    ];

    const result = computeOutstandingCredit(account, expenses, [], bills, "2026-09-10");
    
    expect(result.statementDue).toBe(20000);
    expect(result.unbilledSpend).toBe(5000);
    expect(result.totalOutstanding).toBe(25000);
    expect(result.availableCredit).toBe(45000); // 50000 - 5000 (unbilled spend only)
  });

  it("does not double-count partial payments", () => {
    const expenses = [
      createExpense("e1", 20000, "2026-08-10"),
    ];

    const payments: AccountPayment[] = [
      {
        id: "p1",
        amount: 5000,
        date: "2026-09-08",
        toAccountId: account.id,
        fromAccountId: "bank_1",
        sourceType: "account",
      } as AccountPayment
    ];

    const bills: OpenCreditBillSlice[] = [
      {
        id: "bill_1",
        accountId: account.id,
        statementDate: "2026-09-05",
        billingPeriodStart: "2026-08-06",
        billingPeriodEnd: "2026-09-05",
        statementAmount: 20000,
        amountPaid: 5000,
        remainingAmount: 15000,
        status: "PARTIALLY_PAID",
        paymentIds: ["p1"],
      }
    ];

    const result = computeOutstandingCredit(account, expenses, payments, bills, "2026-09-10");
    
    // Remaining statement due is 15000
    expect(result.statementDue).toBe(15000);
    expect(result.unbilledSpend).toBe(0);
    expect(result.totalOutstanding).toBe(15000);
    expect(result.availableCredit).toBe(50000); // 50000 - 0
  });
});
