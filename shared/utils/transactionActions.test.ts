import { describe, expect, it } from "vitest";

import type { Expense, Income } from "@/shared/types/expense";
import { evaluateSubscriptionDue } from "./subscriptionProcessor";
import {
  recurringDraftFromExpense,
  transactionActions,
  transactionShareText,
  type TransactionActionContext,
} from "./transactionActions";

const base: TransactionActionContext = {
  kind: "expense",
  canOpenAccount: true,
  category: "Food",
  isDeleted: false,
  editable: true,
  fromSubscription: false,
  hasBudget: false,
};

const expense = (p: Partial<Expense> = {}): Expense => ({
  id: "e1",
  amount: 649,
  category: "Entertainment",
  subcategory: "OTT",
  note: "Netflix",
  date: "2026-10-12",
  month: "2026-10",
  accountId: "hdfc",
  createdAt: null,
  ...p,
});

describe("transactionActions", () => {
  it("offers every supported action for a live, editable expense", () => {
    expect(transactionActions(base)).toEqual(["viewAccount", "viewCategory", "setBudget", "createRecurring", "share", "delete"]);
    expect(transactionActions({ ...base, hasBudget: true })).toContain("viewBudget");
    expect(transactionActions({ ...base, hasBudget: true })).not.toContain("setBudget");
  });

  it("never offers split, duplicate or attachments — no flow exists for them", () => {
    const all = transactionActions(base) as string[];
    for (const missing of ["split", "duplicate", "addAttachment", "changeAccount", "moveCategory"]) {
      expect(all).not.toContain(missing);
    }
  });

  it("drops delete and recurring for a locked past month, keeps the read-only links", () => {
    expect(transactionActions({ ...base, editable: false })).toEqual(["viewAccount", "viewCategory", "setBudget", "share"]);
  });

  it("does not make a subscription-posted expense recurring again", () => {
    expect(transactionActions({ ...base, fromSubscription: true })).not.toContain("createRecurring");
  });

  it("handles income, other kinds, deleted rows and missing account or category", () => {
    expect(transactionActions({ ...base, kind: "income", category: undefined })).toEqual(["viewAccount", "share", "delete"]);
    expect(transactionActions({ ...base, kind: "other" })).toEqual(["viewAccount"]);
    expect(transactionActions({ ...base, isDeleted: true, canOpenAccount: false })).toEqual([]);
    expect(transactionActions({ ...base, category: undefined, canOpenAccount: false })).toEqual(["share", "delete"]);
  });
});

describe("recurringDraftFromExpense", () => {
  it("prefills a monthly item from the expense, without an id (create, not edit)", () => {
    const draft = recurringDraftFromExpense(expense());
    expect(draft).toMatchObject({
      name: "Netflix",
      amount: 649,
      category: "Entertainment",
      dayOfMonth: 12,
      frequency: "monthly",
      type: "subscription",
      accountId: "hdfc",
      lastProcessed: "2026-10",
    });
    expect(draft.id).toBeUndefined();
  });

  it("marks the expense's month processed so the auto-poster cannot post it twice", () => {
    const draft = { ...recurringDraftFromExpense(expense()), id: "s1" };
    // Later in the same month, past the billing day: not due again.
    expect(evaluateSubscriptionDue(draft, new Date("2026-10-20T12:00:00")).isDue).toBe(false);
    // Next month on the billing day: due as normal.
    expect(evaluateSubscriptionDue(draft, new Date("2026-11-12T12:00:00")).isDue).toBe(true);
  });

  it("falls back to the category when there is no note, and uses the month field", () => {
    const draft = recurringDraftFromExpense(expense({ note: "", subcategory: undefined, date: "2026-11-02", month: "2026-10" }));
    expect(draft.name).toBe("Entertainment");
    expect(draft.lastProcessed).toBe("2026-10");
    expect(draft.dayOfMonth).toBe(2);
  });
});

describe("transactionShareText", () => {
  it("shares what, how much, when and the category — never the account", () => {
    const text = transactionShareText({ row: expense(), kind: "expense", amountLabel: "₹649.00", dateLabel: "12 Oct 2026" });
    expect(text).toBe("Netflix\nSpent: ₹649.00\nDate: 12 Oct 2026\nCategory: Entertainment › OTT");
    expect(text).not.toContain("hdfc");
  });

  it("handles income and a row with no note", () => {
    const income = { note: "", source: "Salary", date: "2026-10-01" } as Income;
    expect(transactionShareText({ row: income, kind: "income", amountLabel: "₹50,000", dateLabel: "1 Oct 2026" })).toBe(
      "Salary\nReceived: ₹50,000\nDate: 1 Oct 2026"
    );
  });
});
