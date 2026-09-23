import { describe, expect, it } from "vitest";

import type { Account, AccountPayment, Expense } from "../types/expense";
import type { CreditCardBill } from "../types/creditCardBill";
import {
  assessCardAnalyticsCompleteness,
  buildCardAnalyticsWorkspace,
} from "./creditCardAnalytics";

const account: Account = {
  id: "card_1",
  name: "Test Card",
  typeId: "credit_type",
  currency: "INR",
  createdAt: Date.now(),
  creditLimit: 50_000,
  billGenerationDay: 5,
} as Account;

function expense(
  id: string,
  amount: number,
  date: string,
  extras: Partial<Expense> = {}
): Expense {
  return {
    id,
    accountId: account.id,
    amount,
    date,
    month: date.slice(0, 7),
    category: extras.category || "Food",
    subcategory: extras.subcategory || "Other",
    note: extras.note || "Merchant",
    createdAt: Date.now(),
  } as Expense;
}

function payment(
  id: string,
  amount: number,
  date: string,
  extras: Partial<AccountPayment> = {}
): AccountPayment {
  return {
    id,
    toAccountId: account.id,
    amount,
    date,
    note: extras.note || "Payment",
    createdAt: Date.now(),
    ...extras,
  } as AccountPayment;
}

function bill(
  overrides: Partial<CreditCardBill> &
    Pick<CreditCardBill, "id" | "statementDate" | "statementAmount">
): CreditCardBill {
  return {
    accountId: account.id,
    dueDate: overrides.dueDate || overrides.statementDate,
    amountPaid: 0,
    status: "PAID",
    billingPeriodStart: overrides.billingPeriodStart,
    billingPeriodEnd: overrides.billingPeriodEnd || overrides.statementDate,
    paymentIds: [],
    ...overrides,
  } as CreditCardBill;
}

describe("assessCardAnalyticsCompleteness", () => {
  it("blocks authoritative analytics while the ledger is incomplete", () => {
    const result = assessCardAnalyticsCompleteness({
      expensesComplete: false,
      hasHistory: true,
    });
    expect(result.ready).toBe(false);
    expect(result.reason).toBe("incomplete_ledger");
  });

  it("marks empty histories without pretending they failed", () => {
    const result = assessCardAnalyticsCompleteness({
      expensesComplete: true,
      hasHistory: false,
    });
    expect(result.ready).toBe(true);
    expect(result.reason).toBe("no_history");
  });
});

describe("buildCardAnalyticsWorkspace", () => {
  it("returns an empty-ready workspace with zero history", () => {
    const workspace = buildCardAnalyticsWorkspace({
      account,
      expenses: [],
      payments: [],
      bills: [],
      today: "2026-09-10",
      expensesComplete: true,
    });
    expect(workspace.completeness.reason).toBe("no_history");
    expect(workspace.snapshot.totalOutstanding).toBe(0);
    expect(workspace.cycles).toHaveLength(0);
    expect(workspace.categorySummary).toHaveLength(0);
  });

  it("gates incomplete ledgers even when staged spend exists", () => {
    const workspace = buildCardAnalyticsWorkspace({
      account,
      expenses: [expense("e1", 1000, "2026-09-08")],
      payments: [],
      today: "2026-09-10",
      expensesComplete: false,
    });
    expect(workspace.completeness.ready).toBe(false);
    expect(workspace.completeness.reason).toBe("incomplete_ledger");
    // Snapshot still projects from the staged page for layout, but UI must hide it.
    expect(workspace.snapshot.unbilledSpend).toBe(1000);
  });

  it("projects multi-cycle billed vs paid without double-counting cashback", () => {
    const bills = [
      bill({
        id: "b-aug",
        statementDate: "2026-08-05",
        billingPeriodStart: "2026-07-06",
        billingPeriodEnd: "2026-08-05",
        statementAmount: 10_000,
        amountPaid: 10_000,
        status: "PAID",
        paymentIds: ["p-user", "p-cb"],
      }),
      bill({
        id: "b-sep",
        statementDate: "2026-09-05",
        billingPeriodStart: "2026-08-06",
        billingPeriodEnd: "2026-09-05",
        statementAmount: 8_000,
        amountPaid: 3_000,
        status: "PARTIALLY_PAID",
        paymentIds: ["p-sep"],
      }),
    ];
    const payments = [
      payment("p-user", 7_000, "2026-08-10"),
      payment("p-cb", 3_000, "2026-08-12", {
        note: "Cashback credit",
        sourceType: "cashback",
      }),
      payment("p-sep", 3_000, "2026-09-08"),
    ];
    const expenses = [
      expense("e-jul", 10_000, "2026-07-20", { note: "Amazon", category: "Shopping" }),
      expense("e-aug", 8_000, "2026-08-20", { note: "Swiggy", category: "Food" }),
      expense("e-sep", 2_000, "2026-09-08", { note: "Uber", category: "Travel" }),
    ];

    const workspace = buildCardAnalyticsWorkspace({
      account,
      expenses,
      payments,
      bills,
      today: "2026-09-10",
      expensesComplete: true,
      lookback: 6,
    });

    expect(workspace.completeness.ready).toBe(true);
    expect(workspace.snapshot.unbilledSpend).toBe(2000);
    expect(workspace.cycles.length).toBeGreaterThanOrEqual(2);

    const aug = workspace.cycles.find((c) => c.statementDate === "2026-08-05");
    expect(aug).toMatchObject({
      billed: 10_000,
      cashbackApplied: 3_000,
      userPaid: 7_000,
    });
    expect(aug!.userPaid + aug!.cashbackApplied).toBe(aug!.paid);

    expect(workspace.cycleComparison).not.toBeNull();
    expect(workspace.categorySummary[0]?.category).toBeDefined();
    expect(workspace.merchantSummary.some((row) => row.note === "Uber")).toBe(
      true
    );
  });

  it("builds calendar-month spend series with correct period boundaries", () => {
    const workspace = buildCardAnalyticsWorkspace({
      account,
      expenses: [
        expense("e1", 100, "2026-07-15"),
        expense("e2", 200, "2026-08-15"),
        expense("e3", 400, "2026-09-08"),
      ],
      payments: [],
      today: "2026-09-10",
      expensesComplete: true,
      mode: "calendar_months",
      lookback: 3,
    });
    expect(workspace.monthlySpend.map((p) => p.month)).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
    expect(workspace.monthlySpend.map((p) => p.spend)).toEqual([100, 200, 400]);
  });

  it("ignores expenses on other accounts", () => {
    const workspace = buildCardAnalyticsWorkspace({
      account,
      expenses: [
        expense("mine", 500, "2026-09-08"),
        {
          ...expense("other", 9999, "2026-09-08"),
          accountId: "other-card",
        },
      ],
      payments: [],
      today: "2026-09-10",
      expensesComplete: true,
    });
    expect(workspace.snapshot.unbilledSpend).toBe(500);
  });
});
