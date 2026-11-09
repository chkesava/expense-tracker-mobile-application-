import { describe, expect, it, vi } from "vitest";

import type { CreditCardBill } from "@/shared/types/creditCardBill";
import { computeRemainingAmount } from "@/shared/utils/creditCardBillStatus";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BILL_PASS_FIRESTORE_MIN_INTERVAL_MS,
  billPassFingerprint,
  billPassHasWork,
  billPassInputPlan,
  billPassListenersReady,
  billPassReadsCopy,
  billPassThrottled,
  loadAuthoritativeBillInputs,
  toCreditCardBill,
  type AuthoritativeReader,
  type BillPassInputs,
} from "./billPass";

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

describe("the bill pass retries a stale stored settlement (SPENDLY-719)", () => {
  const card = { id: "card", name: "Roar", typeId: "t-card", billGenerationDay: 1, creditLimit: 35000 };
  const inputs = (stored: Record<string, unknown>): BillPassInputs => ({
    accounts: [card],
    accountTypes: [{ id: "t-card", name: "Credit Card" }],
    expenses: [
      { id: "e1", accountId: "card", amount: 300, date: "2026-10-10", month: "2026-10", category: "Food", note: "", createdAt: null },
      { id: "e2", accountId: "card", amount: 205, date: "2026-10-25", month: "2026-10", category: "Food", note: "", createdAt: null },
    ],
    payments: [
      { id: "pay-hdfc", fromAccountId: "bank", toAccountId: "card", amount: 268.71, date: "2026-11-02" },
      { id: "cb-roar", fromAccountId: "bank", toAccountId: "card", amount: 236.29, date: "2026-10-20", sourceType: "cashback" },
    ],
    bills: [
      toCreditCardBill(
        billDoc("roar-nov", {
          statementDate: "2026-11-01",
          billingPeriodStart: "2026-10-02",
          billingPeriodEnd: "2026-11-01",
          dueDate: "2026-11-06",
          statementAmount: 505,
          ...stored,
        }),
        "2026-11-08"
      ),
    ],
  }) as unknown as BillPassInputs;

  it("a bill stamped with the cash payment only (268.71 of 505) is work: the ledger settles it with cashback", () => {
    expect(billPassHasWork(inputs({ amountPaid: 268.71, paymentIds: ["pay-hdfc"] }), "2026-11-08", derived)).toBe(true);
  });

  const base = { drafts: [], patches: [], duplicates: [], allocations: [{ billId: "roar-nov", amountPaid: 505, paymentIds: ["cb-roar", "pay-hdfc"] }] };
  const bill = (amountPaid: number, status: CreditCardBill["status"]) =>
    ({ id: "roar-nov", amountPaid, paymentIds: ["pay-hdfc"], status, remainingAmount: computeRemainingAmount(505, amountPaid) });

  it("the fingerprint changes when the stored settlement changes, so a skipped write is not mistaken for done", () => {
    const before = billPassFingerprint({ ...base, bills: [bill(0, "OVERDUE")] });
    const afterStamp = billPassFingerprint({ ...base, bills: [bill(268.71, "PARTIALLY_PAID")] });
    expect(afterStamp).not.toBe(before);
  });

  it("the fingerprint is stable for identical inputs, whatever the order", () => {
    const a = billPassFingerprint({ ...base, bills: [bill(268.71, "PARTIALLY_PAID"), { ...bill(0, "UPCOMING"), id: "other" }] });
    const b = billPassFingerprint({ ...base, bills: [{ ...bill(0, "UPCOMING"), id: "other" }, bill(268.71, "PARTIALLY_PAID")] });
    expect(a).toBe(b);
  });
});

describe("the bill pass runs on a staged ledger, from Firestore (SPENDLY-732)", () => {
  it("a staged expenses page (300+ rows, never complete since SPENDLY-409) reads Firestore instead of skipping", () => {
    expect(billPassInputPlan({ readsCopy: false, ledgerComplete: false })).toBe("firestore");
    expect(billPassInputPlan({ readsCopy: true, ledgerComplete: false })).toBe("firestore");
  });

  it("a whole ledger keeps the existing paths: screen data, or the copy's work check first (SPENDLY-597)", () => {
    expect(billPassInputPlan({ readsCopy: false, ledgerComplete: true })).toBe("screen");
    expect(billPassInputPlan({ readsCopy: true, ledgerComplete: true })).toBe("checkScreenThenFirestore");
  });

  it("starts once the listeners delivered, without waiting for the whole ledger", () => {
    expect(billPassListenersReady({ billsLoading: false, expensesLoading: false, paymentsLoading: false })).toBe(true);
    expect(billPassListenersReady({ billsLoading: true, expensesLoading: false, paymentsLoading: false })).toBe(false);
    expect(billPassListenersReady({ billsLoading: false, expensesLoading: true, paymentsLoading: false })).toBe(false);
    expect(billPassListenersReady({ billsLoading: false, expensesLoading: false, paymentsLoading: true })).toBe(false);
  });

  it("throttles only background triggers of a Firestore pass", () => {
    const now = 10 * BILL_PASS_FIRESTORE_MIN_INTERVAL_MS;
    const recent = now - 60_000;
    const old = now - BILL_PASS_FIRESTORE_MIN_INTERVAL_MS;
    expect(billPassThrottled({ plan: "firestore", trigger: "background", lastFirestorePassAt: recent, now })).toBe(true);
    expect(billPassThrottled({ plan: "firestore", trigger: "background", lastFirestorePassAt: old, now })).toBe(false);
    expect(billPassThrottled({ plan: "firestore", trigger: "background", lastFirestorePassAt: null, now })).toBe(false);
    // The session's first pass and passes after a money action always run.
    expect(billPassThrottled({ plan: "firestore", trigger: "initial", lastFirestorePassAt: recent, now })).toBe(false);
    expect(billPassThrottled({ plan: "firestore", trigger: "requested", lastFirestorePassAt: recent, now })).toBe(false);
    // Screen-data passes cost no reads: never throttled.
    expect(billPassThrottled({ plan: "screen", trigger: "background", lastFirestorePassAt: recent, now })).toBe(false);
  });

  it("the reported Roar bill heals on Firestore inputs although the screen holds only the staged page", async () => {
    // Firestore: the whole card ledger (both cycle expenses, cash payment + cashback, the cash-only stamp).
    const docs: Record<string, { id: string; data: Record<string, unknown> }[]> = {
      accounts: [{ id: "card", data: { name: "Roar", typeId: "t-card", billGenerationDay: 1, creditLimit: 35000 } }],
      accountTypes: [{ id: "t-card", data: { name: "Credit Card" } }],
      accountPayments: [
        { id: "pay-hdfc", data: { fromAccountId: "bank", toAccountId: "card", amount: 268.71, date: "2026-11-02" } },
        { id: "cb-roar", data: { fromAccountId: "cashback", toAccountId: "card", amount: 236.29, date: "2026-10-20", sourceType: "cashback" } },
      ],
      creditCardBills: [
        billDoc("roar-nov", {
          statementDate: "2026-11-01",
          billingPeriodStart: "2026-10-02",
          billingPeriodEnd: "2026-11-01",
          dueDate: "2026-11-06",
          statementAmount: 505,
          amountPaid: 268.71,
          paymentIds: ["pay-hdfc"],
          status: "PARTIALLY_PAID",
          remainingAmount: 236.29,
        }),
      ],
    };
    const cardExpenses = [
      { id: "e1", data: { accountId: "card", amount: 300, date: "2026-10-10", month: "2026-10", category: "Food" } },
      { id: "e2", data: { accountId: "card", amount: 205, date: "2026-10-25", month: "2026-10", category: "Food" } },
    ];
    const read: AuthoritativeReader = {
      all: async (c) => docs[c] ?? [],
      where: async (_c, _f, value) => cardExpenses.filter((e) => e.data.accountId === value),
    };
    expect(billPassInputPlan({ readsCopy: false, ledgerComplete: false })).toBe("firestore");
    const inputs = await loadAuthoritativeBillInputs(read, "2026-11-09");
    expect(inputs.expenses).toHaveLength(2);
    expect(billPassHasWork(inputs, "2026-11-09", derived)).toBe(true);
  });

  it("the provider no longer gates the pass on the whole ledger (source guard)", () => {
    const src = readFileSync(join(__dirname, "../../providers/CreditCardBillsProvider.tsx"), "utf8");
    expect(src).not.toContain("canRunAutoCreditCardBillGeneration");
    expect(src).toContain("billPassInputPlan(");
    expect(src).toContain("billPassThrottled(");
  });
});
