import { describe, expect, it } from "vitest";

import type { CreditCardBill } from "../types/creditCardBill";
import type { Account } from "../types/expense";
import type { Subscription } from "../types/subscription";
import {
  alertingShortfalls,
  cardBillDebitAmount,
  computeAutoDebitShortfall,
  subscriptionDebits,
  type AutoDebitShortfallInput,
} from "./autoDebitShortfall";

const TODAY = "2026-11-20";

const bank = (over: Partial<Account> = {}): Account => ({
  id: "bank1",
  name: "HDFC Savings",
  typeId: "t-bank",
  currentBalance: 10000,
  balanceReconciliationStatus: "healthy",
  ...over,
});

const card = (over: Partial<Account> = {}): Account => ({
  id: "card1",
  name: "HDFC Card",
  typeId: "t-cc",
  currentOutstanding: 20000,
  autopayFromAccountId: "bank1",
  ...over,
});

const emi = (over: Partial<Subscription> = {}): Subscription => ({
  id: "emi1",
  name: "Home loan EMI",
  amount: 8000,
  category: "EMI",
  dayOfMonth: 22,
  isActive: true,
  lastProcessed: "2026-10",
  type: "emi",
  accountId: "bank1",
  ...over,
});

const bill = (over: Partial<CreditCardBill> = {}): CreditCardBill => ({
  id: "bill1",
  accountId: "card1",
  statementDate: "2026-11-05",
  dueDate: "2026-11-23",
  statementAmount: 15000,
  minimumDueAmount: 1500,
  amountPaid: 0,
  remainingAmount: 15000,
  currency: "INR",
  status: "DUE_SOON",
  reminderEnabled: true,
  reminderFrequency: { daysBefore: [3], onDueDate: true, overdueEveryDays: 1 },
  ...over,
});

const run = (over: Partial<AutoDebitShortfallInput> = {}) =>
  computeAutoDebitShortfall({
    today: TODAY,
    subscriptions: [],
    accounts: [bank()],
    accountTypeNames: { "t-bank": "Bank Account", "t-cc": "Credit Card" },
    creditCardBills: [],
    groupFunds: [],
    defaultLeadDays: 3,
    ...over,
  });

describe("subscription debits", () => {
  it("is covered when the balance is enough", () => {
    const r = run({ subscriptions: [emi()] });
    expect(r.hasShortfall).toBe(false);
    expect(r.accounts).toEqual([]);
  });

  it("flags a single debit the account can't cover, inside its window", () => {
    const r = run({ subscriptions: [emi({ amount: 12000 })] });
    expect(r.hasShortfall).toBe(true);
    expect(r.accounts[0]).toMatchObject({ accountId: "bank1", available: 10000, trusted: true, shortBy: 2000 });
    expect(alertingShortfalls(r)).toEqual([
      expect.objectContaining({ refId: "emi1", dueDate: "2026-11-22", amount: 12000, cumulative: 12000, shortBy: 2000, alerting: true, accountName: "HDFC Savings" }),
    ]);
  });

  it("is not alerting before the item's lead window opens", () => {
    // Due the 22nd, 1 lead day: the window opens on the 21st.
    const r = run({ subscriptions: [emi({ amount: 12000, lowBalanceLeadDays: 1 })] });
    expect(r.hasShortfall).toBe(false);
    expect(r.accounts).toEqual([]);
  });

  it("flags two debits that each fit alone but not together (cumulative)", () => {
    const r = run({
      subscriptions: [emi({ amount: 6000 }), emi({ id: "sub2", name: "Gym", amount: 6000, type: "subscription", dayOfMonth: 21 })],
    });
    const items = r.accounts[0]!.items;
    expect(items.map((i) => [i.refId, i.cumulative, i.shortBy])).toEqual([
      ["sub2", 6000, 0],
      ["emi1", 12000, 2000],
    ]);
    expect(r.accounts[0]!.shortBy).toBe(2000);
  });

  it("counts every debit on the same day at that day", () => {
    const r = run({ subscriptions: [emi({ amount: 6000 }), emi({ id: "emi2", amount: 6000 })] });
    expect(r.accounts[0]!.items.map((i) => i.shortBy)).toEqual([2000, 2000]);
  });

  it("counts an earlier debit outside its own window toward a later alerting one", () => {
    // `early` is due tomorrow with 0 lead days (not alerting today) but still drains the account first.
    const r = run({
      subscriptions: [
        emi({ id: "early", amount: 7000, dayOfMonth: 21, lowBalanceLeadDays: 0 }),
        emi({ id: "late", amount: 5000, dayOfMonth: 22 }),
      ],
    });
    const late = r.accounts[0]!.items.find((i) => i.refId === "late")!;
    expect(late).toMatchObject({ cumulative: 12000, shortBy: 2000, alerting: true });
    expect(r.accounts[0]!.items.find((i) => i.refId === "early")!.alerting).toBe(false);
  });

  it("subtracts money held for group funds in that account", () => {
    const r = run({ subscriptions: [emi()], groupFunds: [{ heldByAccount: { bank1: 3000, other: 9000 } }, { heldByAccount: { bank1: 500 } }] });
    expect(r.accounts[0]).toMatchObject({ available: 6500, heldForOthers: 3500, shortBy: 1500 });
  });

  it("reports an untrusted balance without a shortfall figure", () => {
    const r = run({ subscriptions: [emi()], accounts: [bank({ balanceReconciliationStatus: "needs_reconciliation" })] });
    expect(r.hasShortfall).toBe(false);
    expect(r.accounts[0]).toMatchObject({ trusted: false, available: null, shortBy: 0 });
    expect(r.accounts[0]!.items[0]!.shortBy).toBeNull();
    expect(alertingShortfalls(r)).toEqual([]);
  });

  it("skips paused, completed, SMS-tracked, account-less and zero-amount items", () => {
    const subs = [
      emi({ id: "a", amount: 50000, isActive: false }),
      emi({ id: "b", amount: 50000, isCompleted: true }),
      emi({ id: "c", amount: 50000, source: "sms" }),
      emi({ id: "d", amount: 50000, accountId: undefined }),
      emi({ id: "e", amount: 0 }),
      emi({ id: "f", amount: 50000, type: "transfer", toAccountId: undefined }),
    ];
    expect(run({ subscriptions: subs }).accounts).toEqual([]);
  });

  it("skips an occurrence already posted this month", () => {
    expect(run({ subscriptions: [emi({ amount: 50000, lastProcessed: "2026-11" })] }).accounts).toEqual([]);
  });

  it("skips an EMI whose term ended", () => {
    expect(run({ subscriptions: [emi({ amount: 50000, endYear: 2026, endMonth: 10 })] }).accounts).toEqual([]);
  });

  it("skips an item scheduled to start in a later month", () => {
    expect(run({ subscriptions: [emi({ amount: 50000, startMonth: "2026-12" })] }).accounts).toEqual([]);
  });

  it("includes a debit due today that hasn't posted yet", () => {
    const r = run({ subscriptions: [emi({ amount: 12000, dayOfMonth: 20 })] });
    expect(alertingShortfalls(r)[0]).toMatchObject({ dueDate: TODAY, shortBy: 2000 });
  });

  it("lists every-N-days occurrences in the look-ahead, skipping posted ones", () => {
    const sub = emi({ id: "milk", amount: 1000, frequency: "every_n_days", intervalDays: 2, lastProcessedDate: "2026-11-20", type: "subscription" });
    const dates = subscriptionDebits(sub, TODAY, "2026-11-26", 3).map((d) => d.dueDate);
    expect(dates).toEqual(["2026-11-22", "2026-11-24", "2026-11-26"]);
  });

  it("ignores debits charged to a credit card or an unknown account", () => {
    const r = run({
      accounts: [bank(), card({ autopayFromAccountId: null })],
      subscriptions: [emi({ amount: 50000, accountId: "card1" }), emi({ id: "x", amount: 50000, accountId: "gone" })],
    });
    expect(r.accounts).toEqual([]);
  });
});

describe("card autopay debits", () => {
  it("counts the full remaining amount by default", () => {
    const r = run({ accounts: [bank(), card()], creditCardBills: [bill()] });
    expect(alertingShortfalls(r)).toEqual([
      expect.objectContaining({ kind: "card", refId: "card1", billId: "bill1", accountId: "bank1", amount: 15000, shortBy: 5000, name: "HDFC Card" }),
    ]);
  });

  it("counts the minimum due left after part payments, capped at the remaining amount", () => {
    expect(cardBillDebitAmount({ remainingAmount: 15000, minimumDueAmount: 1500, amountPaid: 0 }, "minimum")).toBe(1500);
    expect(cardBillDebitAmount({ remainingAmount: 14500, minimumDueAmount: 1500, amountPaid: 500 }, "minimum")).toBe(1000);
    expect(cardBillDebitAmount({ remainingAmount: 300, minimumDueAmount: 1500, amountPaid: 0 }, "minimum")).toBe(300);
    expect(cardBillDebitAmount({ remainingAmount: 13000, minimumDueAmount: 1500, amountPaid: 2000 }, "minimum")).toBe(0);
    const r = run({ accounts: [bank({ currentBalance: 1000 }), card({ autopayAmountMode: "minimum" })], creditCardBills: [bill()] });
    expect(alertingShortfalls(r)[0]).toMatchObject({ amount: 1500, shortBy: 500 });
  });

  it("stops for a paid, cancelled, past-due or fully settled bill", () => {
    const bills = [
      bill({ id: "p", status: "PAID" }),
      bill({ id: "c", status: "CANCELLED" }),
      bill({ id: "o", dueDate: "2026-11-19", status: "OVERDUE" }),
      bill({ id: "z", remainingAmount: 0, status: "PARTIALLY_PAID" }),
    ];
    expect(run({ accounts: [bank(), card()], creditCardBills: bills }).accounts).toEqual([]);
  });

  it("needs a link to another account", () => {
    expect(run({ accounts: [bank(), card({ autopayFromAccountId: null })], creditCardBills: [bill()] }).accounts).toEqual([]);
    expect(run({ accounts: [bank(), card({ autopayFromAccountId: "card1" })], creditCardBills: [bill()] }).accounts).toEqual([]);
  });

  it("uses the card's own lead days", () => {
    // Due the 23rd with 1 lead day: the window opens the 22nd.
    expect(run({ accounts: [bank(), card({ autopayLeadDays: 1 })], creditCardBills: [bill()] }).accounts).toEqual([]);
  });

  it("adds card autopay and EMIs on the same paying account", () => {
    const r = run({ accounts: [bank({ currentBalance: 16000 }), card()], creditCardBills: [bill()], subscriptions: [emi({ amount: 2000 })] });
    expect(r.accounts[0]!.items.map((i) => [i.kind, i.cumulative, i.shortBy])).toEqual([
      ["subscription", 2000, 0],
      ["card", 17000, 1000],
    ]);
  });
});

describe("result ordering", () => {
  it("lists the account with the largest shortfall first", () => {
    const r = run({
      accounts: [bank(), bank({ id: "bank2", name: "SBI", currentBalance: 100 })],
      subscriptions: [emi({ amount: 11000 }), emi({ id: "e2", amount: 5000, accountId: "bank2" })],
    });
    expect(r.accounts.map((a) => [a.accountId, a.shortBy])).toEqual([
      ["bank2", 4900],
      ["bank1", 1000],
    ]);
  });
});
