import { describe, expect, it } from "vitest";

import type { Account, AccountPayment, Expense } from "../types/expense";
import { AUTO_CREDIT_CARD_BILL_REMINDER_FREQUENCY } from "../types/creditCardBill";
import {
  AUTO_CREDIT_CARD_BILL_NOTE,
  buildAutoCreditCardBillDraft,
  collectAutoCreditCardBillRefreshPatches,
  previewClosedCycleCreditCardBill,
} from "./autoCreditCardBills";

const creditCard: Account = {
  id: "cc-slice",
  name: "Slice credit card",
  typeId: "t-credit",
  billGenerationDay: 15,
};

function expense(date: string, amount: number): Expense {
  return {
    amount,
    category: "Food",
    note: "test",
    date,
    month: date.slice(0, 7),
    accountId: creditCard.id,
    createdAt: date,
  };
}

function payment(date: string, amount: number): AccountPayment {
  return {
    id: `pay-${date}`,
    fromAccountId: "bank-1",
    toAccountId: creditCard.id,
    amount,
    date,
  };
}

const baseInput = {
  account: creditCard,
  typeName: "Credit Card",
  expenses: [] as Expense[],
  payments: [] as AccountPayment[],
  existingBills: [] as { accountId: string; statementDate: string }[],
  today: "2026-08-15",
};

describe("buildAutoCreditCardBillDraft", () => {
  it("creates a statement on generation day with due date 5 days later", () => {
    const draft = buildAutoCreditCardBillDraft({
      ...baseInput,
      expenses: [
        expense("2026-07-20", 1000),
        expense("2026-08-01", 400),
        expense("2026-08-15", 50),
      ],
    });

    expect(draft).toMatchObject({
      accountId: "cc-slice",
      statementAmount: 1450,
      minimumDueAmount: 72.5,
      statementDate: "2026-08-15",
      dueDate: "2026-08-20",
      billingPeriodStart: "2026-07-15",
      billingPeriodEnd: "2026-08-15",
      reminderFrequency: AUTO_CREDIT_CARD_BILL_REMINDER_FREQUENCY,
    });
    expect(draft?.note).toContain("Auto-created");
  });

  it("uses the previous month statement when today is after generation day", () => {
    const draft = buildAutoCreditCardBillDraft({
      ...baseInput,
      today: "2026-08-20",
      expenses: [expense("2026-07-20", 2500)],
    });

    expect(draft?.statementDate).toBe("2026-08-15");
    expect(draft?.dueDate).toBe("2026-08-20");
    expect(draft?.statementAmount).toBe(2500);
  });

  it("subtracts cycle payments from the statement amount", () => {
    const draft = buildAutoCreditCardBillDraft({
      ...baseInput,
      expenses: [expense("2026-07-20", 2000)],
      payments: [payment("2026-08-01", 500)],
    });

    expect(draft?.statementAmount).toBe(1500);
    expect(draft?.minimumDueAmount).toBe(75);
  });

  it("returns null when a bill already exists for the statement date", () => {
    const draft = buildAutoCreditCardBillDraft({
      ...baseInput,
      expenses: [expense("2026-07-20", 1000)],
      existingBills: [{ accountId: "cc-slice", statementDate: "2026-08-15" }],
    });

    expect(draft).toBeNull();
  });

  it("returns null when billGenerationDay is missing", () => {
    const draft = buildAutoCreditCardBillDraft({
      ...baseInput,
      account: { ...creditCard, billGenerationDay: undefined },
      expenses: [expense("2026-07-20", 1000)],
    });

    expect(draft).toBeNull();
  });

  it("returns null when closed-cycle spend is zero", () => {
    const draft = buildAutoCreditCardBillDraft({
      ...baseInput,
      expenses: [expense("2026-08-16", 900)],
    });

    expect(draft).toBeNull();
  });

  it("returns null for non-credit accounts", () => {
    const draft = buildAutoCreditCardBillDraft({
      ...baseInput,
      typeName: "Bank",
      expenses: [expense("2026-07-20", 1000)],
    });

    expect(draft).toBeNull();
  });

  it("wraps due date into the next month", () => {
    const draft = buildAutoCreditCardBillDraft({
      ...baseInput,
      account: { ...creditCard, billGenerationDay: 28 },
      today: "2026-08-28",
      expenses: [expense("2026-08-01", 800)],
    });

    expect(draft?.statementDate).toBe("2026-08-28");
    expect(draft?.dueDate).toBe("2026-09-02");
    expect(draft?.statementAmount).toBe(800);
  });

  it("bills previous generation date through this generation date for a 21st cycle", () => {
    const draft = buildAutoCreditCardBillDraft({
      ...baseInput,
      account: { ...creditCard, billGenerationDay: 21 },
      today: "2026-08-21",
      expenses: [
        expense("2026-07-20", 90),
        expense("2026-07-21", 1100),
        expense("2026-08-01", 400),
        expense("2026-08-20", 50),
        expense("2026-08-21", 25),
        expense("2026-08-22", 999),
      ],
    });

    expect(draft).toMatchObject({
      statementDate: "2026-08-21",
      dueDate: "2026-08-26",
      billingPeriodStart: "2026-07-21",
      billingPeriodEnd: "2026-08-21",
      statementAmount: 1575,
    });
  });

  it("accepts a string billGenerationDay from Firestore", () => {
    const draft = buildAutoCreditCardBillDraft({
      ...baseInput,
      account: { ...creditCard, billGenerationDay: "21" as unknown as number },
      today: "2026-08-21",
      expenses: [expense("2026-08-01", 300)],
    });
    expect(draft?.statementAmount).toBe(300);
    expect(draft?.billingPeriodStart).toBe("2026-07-21");
  });

  it("previews a 21st-cycle window even when statement amount is 0", () => {
    const preview = previewClosedCycleCreditCardBill({
      account: { ...creditCard, billGenerationDay: 21 },
      typeName: "Credit Card",
      today: "2026-08-21",
      expenses: [expense("2026-07-20", 90), expense("2026-08-22", 999)],
      payments: [],
    });

    expect(preview).toMatchObject({
      statementDate: "2026-08-21",
      billingPeriodStart: "2026-07-21",
      billingPeriodEnd: "2026-08-21",
      statementAmount: 0,
    });
    expect(
      buildAutoCreditCardBillDraft({
        ...baseInput,
        account: { ...creditCard, billGenerationDay: 21 },
        today: "2026-08-21",
        expenses: [expense("2026-07-20", 90), expense("2026-08-22", 999)],
      })
    ).toBeNull();
  });
});

describe("collectAutoCreditCardBillRefreshPatches", () => {
  it("updates an unpaid auto bill when the cycle window was too short", () => {
    const patches = collectAutoCreditCardBillRefreshPatches({
      accounts: [{ ...creditCard, billGenerationDay: 21 }],
      typeNameById: new Map([["t-credit", "Credit Card"]]),
      expenses: [
        expense("2026-07-21", 1000),
        expense("2026-08-21", 200),
      ],
      payments: [],
      existingBills: [
        {
          id: "bill-1",
          accountId: creditCard.id,
          statementDate: "2026-08-21",
          statementAmount: 1000,
          billingPeriodStart: "2026-08-01",
          billingPeriodEnd: "2026-08-20",
          note: AUTO_CREDIT_CARD_BILL_NOTE,
          amountPaid: 0,
          status: "UPCOMING",
        },
      ],
      today: "2026-08-21",
    });

    expect(patches).toEqual([
      {
        billId: "bill-1",
        statementAmount: 1200,
        minimumDueAmount: 60,
        billingPeriodStart: "2026-07-21",
        billingPeriodEnd: "2026-08-21",
        dueDate: "2026-08-26",
      },
    ]);
  });
});
