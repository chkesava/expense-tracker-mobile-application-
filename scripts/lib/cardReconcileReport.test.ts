import { describe, expect, it } from "vitest";

import type { Account, AccountPayment, Expense, Income } from "../../shared/types/expense";
import type { LedgerBillSlice } from "../../shared/utils/creditCardLedger";
import { buildCardReconcileReport, renderCardReconcileReport } from "./cardReconcileReport";

// SPENDLY-675: the Roar shape — a ₹505 statement for 10/02 → 11/01, unpaid,
// and a stored total of ₹268.71.
const TODAY = "2026-11-02";
const card = (currentOutstanding: number) =>
  ({
    id: "roar",
    name: "Roar",
    typeId: "t",
    creditLimit: 50_000,
    billGenerationDay: 1,
    currentOutstanding,
  }) as Account & { currentOutstanding: number };
const expense = (id: string, amount: number, date: string): Expense =>
  ({ id, amount, date, month: date.slice(0, 7), accountId: "roar", category: "Food", note: "" }) as Expense;
const payment = (id: string, amount: number, date: string): AccountPayment =>
  ({ id, fromAccountId: "bank", toAccountId: "roar", amount, date, sourceType: "account" }) as AccountPayment;
const bill: LedgerBillSlice = {
  id: "bill-oct",
  accountId: "roar",
  statementDate: "2026-11-01",
  billingPeriodStart: "2026-10-02",
  billingPeriodEnd: "2026-11-01",
  statementAmount: 505,
  amountPaid: 0,
  remainingAmount: 505,
  status: "UPCOMING",
} as LedgerBillSlice;
const spend = [expense("e1", 300, "2026-10-05"), expense("e2", 205, "2026-10-25")];
const base = { bills: [bill], incomes: [] as Income[], entries: [], transfers: [], today: TODAY };

describe("buildCardReconcileReport (SPENDLY-675)", () => {
  it("names a payment made before the close as the credit no statement absorbed", () => {
    const r = buildCardReconcileReport({
      ...base,
      account: card(268.71),
      expenses: spend,
      payments: [payment("p1", 236.29, "2026-10-20")],
    });
    expect(r.statements[0]).toMatchObject({ billed: 505, spendInWindow: 505, ledgerRemaining: 505, storedRemaining: 505 });
    expect(r.ledger.statementDue).toBe(505);
    expect(r.ledger.unappliedCredit).toBe(236.29);
    expect(r.gapVsStatements).toBe(-236.29);
    expect(r.rebuildVariances).toEqual([]);
    expect(r.unappliedCreditRows).toEqual([
      expect.objectContaining({ id: "p1", amount: 236.29, datedIn: "2026-11-01", appliedTo: null }),
    ]);
  });

  it("names a refund dated inside the statement window the same way", () => {
    const r = buildCardReconcileReport({
      ...base,
      account: card(268.71),
      expenses: spend,
      payments: [],
      incomes: [{ id: "i1", amount: 236.29, date: "2026-10-28", accountId: "roar" } as Income],
    });
    expect(r.ledger.statementDue).toBe(505);
    expect(r.unappliedCreditRows.map((c) => [c.kind, c.amount])).toEqual([["income", 236.29]]);
    expect(r.rebuildVariances).toEqual([]);
  });

  it("flags drift when no credit explains a lower stored total", () => {
    const r = buildCardReconcileReport({ ...base, account: card(268.71), expenses: spend, payments: [] });
    expect(r.unappliedCreditRows).toEqual([]);
    expect(r.ledger.unappliedCredit).toBe(0);
    expect(r.rebuildVariances).toEqual(["currentOutstanding: 268.71 → 505"]);
  });

  it("shows no gap when a payment after the close pays the statement", () => {
    const r = buildCardReconcileReport({
      ...base,
      account: card(268.71),
      expenses: spend,
      payments: [payment("p1", 236.29, "2026-11-02")],
    });
    expect(r.ledger.statementDue).toBe(268.71);
    expect(r.gapVsStatements).toBe(0);
    expect(r.credits[0]).toMatchObject({ appliedTo: "2026-11-01", datedIn: "open cycle" });
  });

  it("shows the allocation the in-app pass owes a stale bill (the real Roar shape)", () => {
    // Cashback dated inside the window settles part of the statement; the
    // stored bill still says ₹0 paid until the bill pass writes it.
    const r = buildCardReconcileReport({
      ...base,
      account: card(268.71),
      expenses: spend,
      payments: [{ ...payment("cb", 236.29, "2026-10-08"), sourceType: "cashback" } as AccountPayment],
    });
    expect(r.statements[0]).toMatchObject({ ledgerPaid: 236.29, ledgerRemaining: 268.71, storedPaid: 0, storedRemaining: 505 });
    expect(r.rebuildVariances).toEqual([]);
    expect(r.pendingAllocations).toEqual([
      expect.objectContaining({ billId: "bill-oct", amountPaid: 236.29, paymentIds: ["cb"] }),
    ]);
    expect(r.bills[0]).toMatchObject({ id: "bill-oct", claimed: true });
  });

  it("renders without the uid and marks unapplied credits", () => {
    const r = buildCardReconcileReport({
      ...base,
      account: card(268.71),
      expenses: spend,
      payments: [payment("p1", 236.29, "2026-10-20")],
    });
    const text = renderCardReconcileReport("Roar", "roar", r);
    expect(text).toContain("| 2026-10-20 | payment:account | p1 | ₹236.29 | 2026-11-01 | **none** |  |");
    expect(text).toContain("consistent (a rebuild would not change it)");
  });
});
