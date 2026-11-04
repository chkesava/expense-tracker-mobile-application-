import { describe, expect, it, vi } from "vitest";

import type { CreditCardBill } from "@/shared/types/creditCardBill";
import { computeRemainingAmount } from "@/shared/utils/creditCardBillStatus";

import { billPassHasWork, billPassReadsCopy, loadAuthoritativeBillInputs, toCreditCardBill, type AuthoritativeReader, type BillPassInputs } from "./billPass";

const TODAY = "2026-11-04";
const derived = (bill: CreditCardBill) => ({ status: bill.status, remainingAmount: computeRemainingAmount(bill.statementAmount, bill.amountPaid) });
const empty: BillPassInputs = { accounts: [], accountTypes: [], expenses: [], payments: [], bills: [] };

const billDoc = (id: string, data: Record<string, unknown>) => ({
  id,
  data: { accountId: "card", statementDate: "2026-10-05", dueDate: "2026-10-25", statementAmount: 1000, amountPaid: 0, ...data },
});

describe("the credit card bill pass never writes from the copy (SPENDLY-597, R4.3a)", () => {
  it("maps a stored bill as the listener does: numbers, remaining, recomputed status, CANCELLED kept", () => {
    const bill = toCreditCardBill(billDoc("b1", { statementAmount: "1000", amountPaid: 400, status: "PENDING" }), TODAY);
    expect(bill).toMatchObject({ id: "b1", statementAmount: 1000, amountPaid: 400, remainingAmount: 600, paymentIds: [] });
    expect(bill.status).not.toBe("PENDING"); // recomputed from the due date, never trusted from storage
    expect(toCreditCardBill(billDoc("b2", { status: "CANCELLED" }), TODAY).status).toBe("CANCELLED");
    expect(toCreditCardBill(billDoc("b3", { remainingAmount: 5 }), TODAY).remainingAmount).toBe(5);
  });

  it("no work, no Firestore reads: an empty or settled ledger has nothing to write", () => {
    expect(billPassHasWork(empty, TODAY, derived)).toBe(false);
  });

  it("work: two statements for the same card and cycle must be merged", () => {
    const bill = (id: string) => toCreditCardBill(billDoc(id, { billingPeriodStart: "2026-09-06", billingPeriodEnd: "2026-10-05" }), TODAY);
    expect(billPassHasWork({ ...empty, bills: [bill("b1"), bill("b2")] }, TODAY, derived)).toBe(true);
  });

  it("loads the pass's inputs from Firestore: only credit cards' expenses, active only, payments newest first", async () => {
    const reader: AuthoritativeReader = {
      all: vi.fn(async (name) => {
        if (name === "accounts")
          return [
            { id: "bank", data: { name: "Bank", typeId: "t-bank" } },
            { id: "card", data: { name: "Card", typeId: "t-card" } },
          ];
        if (name === "accountTypes")
          return [
            { id: "t-bank", data: { name: "Bank" } },
            { id: "t-card", data: { name: "Credit Card" } },
          ];
        if (name === "accountPayments")
          return [
            { id: "p1", data: { date: "2026-10-01", amount: 100, toAccountId: "card" } },
            { id: "p2", data: { date: "2026-10-20", amount: 200, toAccountId: "card" } },
          ];
        return [billDoc("b1", { amountPaid: 300 })];
      }),
      where: vi.fn(async (_name, _field, value) =>
        value === "card"
          ? [
              { id: "e1", data: { accountId: "card", amount: 50, date: "2026-10-02" } },
              { id: "e2", data: { accountId: "card", amount: 70, date: "2026-10-03", deletedAt: "2026-10-04T00:00:00.000Z" } },
            ]
          : []
      ),
    };
    const inputs = await loadAuthoritativeBillInputs(reader, TODAY);
    expect(reader.where).toHaveBeenCalledTimes(1);
    expect(reader.where).toHaveBeenCalledWith("expenses", "accountId", "card");
    expect(inputs.expenses.map((e) => e.id)).toEqual(["e1"]);
    expect(inputs.payments.map((p) => p.id)).toEqual(["p2", "p1"]);
    expect(inputs.bills[0]).toMatchObject({ id: "b1", amountPaid: 300, remainingAmount: 700 });
    expect(inputs.accounts.map((a) => a.id)).toEqual(["bank", "card"]);
  });

  it("the copy is involved only when an input is served by it (shadow still serves Firestore)", () => {
    expect(billPassReadsCopy(["firestore", "shadow", "firestore"])).toBe(false);
    expect(billPassReadsCopy(["firestore", "supabase"])).toBe(true);
  });
});
