import { describe, expect, it, vi } from "vitest";

vi.mock("firebase-admin/firestore", () => ({ FieldValue: {}, getFirestore: () => ({}) }));
vi.mock("firebase-admin/app", () => ({ initializeApp: () => ({}), applicationDefault: () => ({}), cert: () => ({}) }));

import { dayBefore, planRebaseline } from "./rebaseline-account";

const TODAY = "2026-10-20";
const base = () =>
  ({
    accounts: [
      { id: "sbi", typeId: "tb", openingBalance: 10000, currentBalance: 49654.96, balanceReconciliationStatus: "needs_reconciliation" },
      { id: "cash", typeId: "tc", openingBalance: 0, currentBalance: 0 },
      { id: "card", typeId: "tcc", currentOutstanding: 0 },
    ],
    accountTypes: [
      { id: "tb", name: "Bank Account" },
      { id: "tc", name: "Cash Wallet" },
      { id: "tcc", name: "Credit Card" },
    ],
    expenses: [
      { id: "old", amount: 500, date: "2026-08-01", month: "2026-08", accountId: "sbi", category: "F" },
      { id: "new", amount: 38, date: "2026-10-19", month: "2026-10", accountId: "sbi", category: "F" },
    ],
    incomes: [],
    payments: [],
    entries: [],
    transfers: [{ id: "t", fromAccountId: "sbi", toAccountId: "cash", amount: 24000, date: "2026-07-29", month: "2026-07" }],
    borrowings: [],
    borrowingRepayments: [],
    receivables: [],
    receivableRepayments: [],
    bills: [],
    epfEstablishments: [],
    epfContributions: [],
    epfTransfers: [],
    epfInterestEntries: [],
    epfReconciliations: [],
  }) as never;

describe("rebaseline-account (SPENDLY-500)", () => {
  it("lands the recomputed balance exactly on the real one, counting rows on the as-of day", () => {
    const plan = planRebaseline(base(), "sbi", 562, "2026-10-19", TODAY);
    expect(plan.movementSinceAsOf).toBe(-38);
    expect(plan.openingBalance).toBe(600);
    expect(plan.after.set.currentBalance).toBe(562);
    expect(plan.after.set.balanceReconciliationStatus).not.toBe("needs_reconciliation");
    expect(plan.before.currentBalance).toBe(49654.96);
  });

  it("ignores history before the as-of date (the incomplete part)", () => {
    const plan = planRebaseline(base(), "cash", 2792, "2026-10-19", TODAY);
    expect(plan.openingBalance).toBe(2792);
    expect(plan.after.set.currentBalance).toBe(2792);
  });

  it("refuses a baseline dated today, a credit card and an unknown account", () => {
    expect(() => planRebaseline(base(), "sbi", 562, TODAY, TODAY)).toThrow(/before today/);
    expect(() => planRebaseline(base(), "card", 0, "2026-10-19", TODAY)).toThrow(/credit card/);
    expect(() => planRebaseline(base(), "nope", 0, "2026-10-19", TODAY)).toThrow(/not found/);
  });

  it("defaults the as-of date to yesterday", () => {
    expect(dayBefore("2026-10-20")).toBe("2026-10-19");
    expect(dayBefore("2026-03-01")).toBe("2026-02-28");
  });
});
