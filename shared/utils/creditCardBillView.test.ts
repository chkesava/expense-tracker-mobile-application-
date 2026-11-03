import { describe, expect, it } from "vitest";

import type { CreditCardBill } from "../types/creditCardBill";
import type { Account, AccountPayment, Expense, Income } from "../types/expense";
import { computeOutstandingCredit } from "./accountBalance";
import { creditCardBillView } from "./creditCardBillView";
import { buildCreditCardLedger } from "./creditCardLedger";
import { roundMoney } from "./money";

// SPENDLY-675: a card that closes on the 1st, like the Roar card.
const TODAY = "2026-11-02";
const card = { id: "roar", name: "Roar", typeId: "t", creditLimit: 50_000, billGenerationDay: 1 } as Account;
const spend = (id: string, amount: number, date: string): Expense =>
  ({ id, amount, date, month: date.slice(0, 7), accountId: "roar", category: "Food", note: "" }) as Expense;
const pay = (id: string, amount: number, date: string, sourceType: AccountPayment["sourceType"] = "account") =>
  ({ id, fromAccountId: "bank", toAccountId: "roar", amount, date, sourceType }) as AccountPayment;
const bill = (id: string, statementDate: string, start: string, statementAmount: number, over: Partial<CreditCardBill> = {}) =>
  ({
    id,
    accountId: "roar",
    statementDate,
    billingPeriodStart: start,
    billingPeriodEnd: statementDate,
    dueDate: "2026-11-06",
    statementAmount,
    amountPaid: 0,
    remainingAmount: statementAmount,
    minimumDueAmount: 0,
    status: "UPCOMING",
    paymentIds: [],
    note: "Auto-created from cycle spend",
    ...over,
  }) as CreditCardBill;

function views(input: {
  expenses: Expense[];
  payments: AccountPayment[];
  bills: CreditCardBill[];
  incomes?: Income[];
}) {
  const movements = { incomes: input.incomes ?? [] };
  const ledger = buildCreditCardLedger({ account: card, ...input, movements, today: TODAY });
  const usage = computeOutstandingCredit(card, input.expenses, input.payments, input.bills, TODAY, movements);
  const byId = new Map(input.bills.map((b) => [b.id, creditCardBillView(b, ledger, input.payments, TODAY)]));
  return { byId, usage };
}

const novBill = (over: Partial<CreditCardBill> = {}) => bill("nov", "2026-11-01", "2026-10-02", 505, over);
const novSpend = [spend("n1", 300, "2026-10-05"), spend("n2", 205, "2026-10-25")];

describe("creditCardBillView (SPENDLY-675)", () => {
  it("the Roar case: a stale stored bill shows the ledger's cashback settlement", () => {
    // Aug: ₹4,536 billed, ₹4,380 paid. The 10-08 cashback of ₹392.29 clears
    // the Aug ₹156 first and the rest (₹236.29) settles Nov.
    const augBill = bill("aug", "2026-08-01", "2026-07-02", 4536, {
      amountPaid: 4536,
      remainingAmount: 0,
      status: "PAID",
      paymentIds: ["p-aug", "cb"],
    });
    const { byId, usage } = views({
      expenses: [spend("a1", 4536, "2026-07-20"), ...novSpend],
      payments: [pay("p-aug", 4380, "2026-08-01"), pay("cb", 392.29, "2026-10-08", "cashback")],
      bills: [augBill, novBill()],
    });
    expect(byId.get("nov")).toMatchObject({
      statementAmount: 505,
      amountPaid: 236.29,
      cashbackApplied: 236.29,
      remainingAmount: 268.71,
      status: "PARTIALLY_PAID",
      source: "ledger",
    });
    expect(byId.get("aug")).toMatchObject({ amountPaid: 4536, cashbackApplied: 156, remainingAmount: 0, status: "PAID" });
    // The statement now agrees with the card's total.
    expect(byId.get("nov")!.remainingAmount).toBe(usage.statementDue);
    expect(roundMoney(usage.statementDue + usage.unbilledSpend)).toBe(268.71);
  });

  it("unpaid statement: ₹505 billed, nothing recorded → ₹0 paid, ₹505 remaining", () => {
    const { byId } = views({ expenses: novSpend, payments: [], bills: [novBill()] });
    expect(byId.get("nov")).toMatchObject({ amountPaid: 0, remainingAmount: 505, cashbackApplied: 0, status: "UPCOMING" });
  });

  it("partial payment after the close", () => {
    const { byId } = views({ expenses: novSpend, payments: [pay("p", 200, "2026-11-02")], bills: [novBill()] });
    expect(byId.get("nov")).toMatchObject({ amountPaid: 200, remainingAmount: 305, cashbackApplied: 0, status: "PARTIALLY_PAID" });
  });

  it("full payment after the close", () => {
    const { byId } = views({ expenses: novSpend, payments: [pay("p", 505, "2026-11-02")], bills: [novBill()] });
    expect(byId.get("nov")).toMatchObject({ amountPaid: 505, remainingAmount: 0, status: "PAID" });
  });

  it("a bank payment before the close never pays the statement (SPENDLY-497 rule kept)", () => {
    const { byId, usage } = views({ expenses: novSpend, payments: [pay("p", 100, "2026-10-20")], bills: [novBill()] });
    expect(byId.get("nov")).toMatchObject({ amountPaid: 0, remainingAmount: 505 });
    expect(usage.unappliedCredit).toBe(100);
  });

  it("current-cycle spend stays off the closed statement", () => {
    const { byId, usage } = views({
      expenses: [...novSpend, spend("c1", 80, "2026-11-02")],
      payments: [],
      bills: [novBill()],
    });
    expect(byId.get("nov")).toMatchObject({ remainingAmount: 505 });
    expect(usage.unbilledSpend).toBe(80);
  });

  it("a refund into the card is not shown as cashback", () => {
    const { byId } = views({
      expenses: novSpend,
      payments: [],
      bills: [novBill()],
      incomes: [{ id: "r1", amount: 50, date: "2026-11-02", accountId: "roar" } as Income],
    });
    expect(byId.get("nov")!.cashbackApplied).toBe(0);
    expect(byId.get("nov")!.amountPaid + byId.get("nov")!.remainingAmount).toBe(505);
  });

  it("multiple statements: each shows its own allocation", () => {
    const oct = bill("oct", "2026-10-01", "2026-09-02", 929);
    const { byId } = views({
      expenses: [spend("o1", 929, "2026-09-15"), ...novSpend],
      payments: [pay("p-oct", 929, "2026-10-02")],
      bills: [oct, novBill()],
    });
    expect(byId.get("oct")).toMatchObject({ amountPaid: 929, remainingAmount: 0, status: "PAID" });
    expect(byId.get("nov")).toMatchObject({ amountPaid: 0, remainingAmount: 505 });
  });

  it("keeps the stored date status when the amounts already agree", () => {
    const { byId } = views({ expenses: novSpend, payments: [], bills: [novBill({ status: "DUE_SOON" })] });
    expect(byId.get("nov")!.status).toBe("DUE_SOON");
  });

  it("falls back to stored fields for a cancelled duplicate", () => {
    const dup = novBill({ id: "dup", status: "CANCELLED", amountPaid: 0, remainingAmount: 505 });
    const ledger = buildCreditCardLedger({ account: card, expenses: novSpend, payments: [], bills: [novBill()], today: TODAY });
    expect(creditCardBillView(dup, ledger, [], TODAY)).toMatchObject({ source: "stored", status: "CANCELLED", remainingAmount: 505 });
  });

  it("falls back to stored fields with no ledger", () => {
    expect(creditCardBillView(novBill({ amountPaid: 5, remainingAmount: 500 }), undefined, [], TODAY)).toMatchObject({
      source: "stored",
      amountPaid: 5,
      remainingAmount: 500,
    });
  });
});
