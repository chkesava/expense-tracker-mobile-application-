import { describe, expect, it } from "vitest";

import type { Account, AccountEntry, AccountPayment, AccountTransfer, Expense, Income } from "../types/expense";
import { computeOutstandingCredit } from "./accountBalance";
import { isCreditCardAccount } from "./accountKind";
import {
  billAllocationBasisUnchanged,
  cardMovementLedgerRows,
  CARD_MOVEMENT_ID_PREFIX,
} from "./creditCardLedger";
import { roundMoney } from "./money";
import { planCardRebuild } from "./reconciliation";

const TODAY = "2026-10-20";
const card = (over: Partial<Account> = {}): Account =>
  ({ id: "card", name: "Card", typeId: "t", creditLimit: 100_000, ...over }) as Account;
const expense = (id: string, amount: number, date: string): Expense =>
  ({ id, amount, date, month: date.slice(0, 7), accountId: "card", category: "Food", note: "" }) as Expense;
const payment = (id: string, amount: number, date: string, sourceType: AccountPayment["sourceType"] = "account"): AccountPayment =>
  ({ id, fromAccountId: "bank", toAccountId: "card", amount, date, sourceType }) as AccountPayment;

describe("cardMovementLedgerRows (SPENDLY-497)", () => {
  it("maps refunds, adjustments and transfers onto credits and debits", () => {
    const { credits, debits } = cardMovementLedgerRows("card", {
      incomes: [
        { id: "i1", amount: 50, date: "2026-10-02", accountId: "card" } as Income,
        { id: "i2", amount: 9, date: "2026-10-02", accountId: "bank" } as Income,
        { id: "i3", amount: 7, date: "2026-10-02", accountId: "card", deletedAt: "x" } as Income,
      ],
      entries: [
        { id: "n1", amount: 20, date: "2026-10-03", accountId: "card", direction: "credit" } as AccountEntry,
        { id: "n2", amount: 30, date: "2026-10-04", accountId: "card", direction: "debit" } as AccountEntry,
      ],
      transfers: [
        { id: "t1", amount: 100, date: "2026-10-05", fromAccountId: "bank", toAccountId: "card" } as AccountTransfer,
        { id: "t2", amount: 40, date: "2026-10-06", fromAccountId: "card", toAccountId: "bank" } as AccountTransfer,
        { id: "t3", amount: 5, date: "2026-10-06", fromAccountId: "card", toAccountId: "card" } as AccountTransfer,
      ],
    });
    expect(credits.map((c) => [c.id, c.amount])).toEqual([
      [`${CARD_MOVEMENT_ID_PREFIX}income:i1`, 50],
      [`${CARD_MOVEMENT_ID_PREFIX}entry:n1`, 20],
      [`${CARD_MOVEMENT_ID_PREFIX}transfer:t1`, 100],
    ]);
    expect(debits.map((d) => [d.id, d.amount])).toEqual([
      [`${CARD_MOVEMENT_ID_PREFIX}entry:n2`, 30],
      [`${CARD_MOVEMENT_ID_PREFIX}transfer:t2`, 40],
    ]);
    expect(credits.every((c) => c.sourceType !== "cashback")).toBe(true);
  });

  it("a refund lowers what the card owes; without movements it would not", () => {
    const refund = { incomes: [{ id: "i1", amount: 300, date: "2026-10-10", accountId: "card" } as Income] };
    const spend = [expense("e1", 1000, "2026-10-05")];
    expect(computeOutstandingCredit(card(), spend, [], [], TODAY).totalOutstanding).toBe(1000);
    expect(computeOutstandingCredit(card(), spend, [], [], TODAY, refund).totalOutstanding).toBe(700);
  });

  it("does not count a refund as money the user paid this cycle", () => {
    const usage = computeOutstandingCredit(card(), [expense("e1", 1000, "2026-10-05")], [], [], TODAY, {
      incomes: [{ id: "i1", amount: 300, date: "2026-10-10", accountId: "card" } as Income],
    });
    expect(usage.paidThisCycle).toBe(0);
  });

  it("counts cashback exactly once", () => {
    // Bill day 25: the open cycle is 26 Sep – 25 Oct, so both rows fall in it.
    const usage = computeOutstandingCredit(
      card({ billGenerationDay: 25 }),
      [expense("e1", 1000, "2026-10-05")],
      [payment("cb", 100, "2026-10-08", "cashback")],
      [],
      TODAY
    );
    expect(usage.totalOutstanding).toBe(900);
    expect(usage.cashbackThisCycle).toBe(100);
    expect(usage.paidThisCycle).toBe(0);
  });

  it("an early payment is set aside, not dropped silently, once its cycle closes", () => {
    // Bill day 20. Spend 25 Sep, paid 28 Sep, statement closes 20 Oct (today).
    const usage = computeOutstandingCredit(
      card({ billGenerationDay: 20 }),
      [expense("e1", 1000, "2026-09-25")],
      [payment("p1", 300, "2026-09-28")],
      [],
      TODAY
    );
    expect(usage.statementDue).toBe(1000);
    expect(usage.totalOutstanding).toBe(1000);
    expect(usage.unappliedCredit).toBe(300);
  });

  it("random card activity: stored total equals ledger total less set-aside credit", () => {
    let seed = 497;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const dates = ["2026-08-03", "2026-08-25", "2026-09-10", "2026-09-28", "2026-10-02", "2026-10-15"];
    for (const billGenerationDay of [undefined, 20]) {
      for (let run = 0; run < 20; run++) {
        const expenses: Expense[] = [];
        const payments: AccountPayment[] = [];
        const incomes: Income[] = [];
        const entries: AccountEntry[] = [];
        const transfers: AccountTransfer[] = [];
        // The write path: currentOutstanding += -amountDelta for each card leg.
        let stored = 0;
        // Activity happens in date order: the ledger only lets a credit settle
        // debt that already exists (credit that outlives every debt is dropped).
        let dateIndex = 0;
        for (let step = 0; step < 40; step++) {
          const id = `r${run}-${step}`;
          const amount = (rand(50_000) + 1) / 100;
          if (rand(5) === 0 && dateIndex < dates.length - 1) dateIndex += 1;
          const date = dates[dateIndex];
          switch (rand(6)) {
            case 0:
            case 1:
              expenses.push(expense(id, amount, date));
              stored += amount;
              break;
            case 2: {
              // Keep credits below what is owed so the card never goes into credit.
              const credit = roundMoney(Math.min(amount, Math.max(0, stored) / 2));
              if (credit <= 0) break;
              payments.push(payment(id, credit, date));
              stored -= credit;
              break;
            }
            case 3: {
              const credit = roundMoney(Math.min(amount, Math.max(0, stored) / 2));
              if (credit <= 0) break;
              incomes.push({ id, amount: credit, date, accountId: "card" } as Income);
              stored -= credit;
              break;
            }
            case 4:
              entries.push({ id, amount, date, accountId: "card", direction: "debit" } as AccountEntry);
              stored += amount;
              break;
            default:
              transfers.push({ id, amount, date, fromAccountId: "card", toAccountId: "bank" } as AccountTransfer);
              stored += amount;
          }
          stored = roundMoney(stored);
        }
        const usage = computeOutstandingCredit(card({ billGenerationDay }), expenses, payments, [], TODAY, {
          incomes,
          entries,
          transfers,
        });
        // The write path subtracts every credit; the ledger sets aside credit
        // no statement can absorb (the kept safe rule), and reports it.
        expect(roundMoney(usage.totalOutstanding - usage.unappliedCredit)).toBe(stored);
        // The ledger's own split: statement due + this cycle + cancelled-statement spend.
        expect(roundMoney(usage.statementDue + usage.unbilledSpend + usage.cancelledSpend)).toBe(usage.totalOutstanding);
      }
    }
  });
});

describe("isCreditCardAccount (SPENDLY-497)", () => {
  it("decides by the account type's name, as every screen does", () => {
    expect(isCreditCardAccount({ typeName: "Credit Card" })).toBe(true);
    expect(isCreditCardAccount({ typeName: "Savings", accountTypeId: "credit_card" })).toBe(false);
    // The old write rule also matched "credit" in the account's own name.
    expect(isCreditCardAccount({ typeName: "Bank" })).toBe(false);
  });

  it("falls back to accountTypeId only when the type name is unknown", () => {
    expect(isCreditCardAccount({ accountTypeId: "credit_card" })).toBe(true);
    expect(isCreditCardAccount({ typeName: " ", accountTypeId: "credit_card" })).toBe(true);
    expect(isCreditCardAccount({})).toBe(false);
  });
});

describe("planCardRebuild (SPENDLY-497)", () => {
  it("reports a wrong total and the stale derived fields to clear", () => {
    const plan = planCardRebuild({ currentOutstanding: 500, statementDue: 100, unbilledSpend: 400 }, 650);
    expect(plan.variances).toEqual(["currentOutstanding: 500 → 650"]);
    expect(plan.staleFields).toEqual(["unbilledSpend", "statementDue"]);
    expect(plan.needsWrite).toBe(true);
  });

  it("leaves a stored total that differs only by set-aside credit", () => {
    const plan = planCardRebuild({ currentOutstanding: 700 }, 1000, 300);
    expect(plan.variances).toEqual([]);
    expect(plan.currentOutstanding).toBe(700);
    expect(plan.needsWrite).toBe(false);
    // Any other difference is real drift and is corrected to the ledger total.
    expect(planCardRebuild({ currentOutstanding: 650 }, 1000, 300).currentOutstanding).toBe(1000);
  });

  it("still writes to clear the reconciliation flag when the total is right", () => {
    expect(planCardRebuild({ currentOutstanding: 650, summaryReconciliationStatus: "needs_reconciliation" }, 650).needsWrite).toBe(true);
    expect(planCardRebuild({ currentOutstanding: 650, summaryReconciliationStatus: "healthy" }, 650).needsWrite).toBe(false);
  });
});

describe("billAllocationBasisUnchanged (SPENDLY-497)", () => {
  const basis = { amountPaid: 500, paymentIds: ["p1"] };

  it("allows the write only when the bill still holds the state the patch came from", () => {
    expect(billAllocationBasisUnchanged({ amountPaid: 500, paymentIds: ["p1"] }, basis)).toBe(true);
  });

  it("skips when a payment landed since the snapshot", () => {
    expect(billAllocationBasisUnchanged({ amountPaid: 800, paymentIds: ["p1", "p2"] }, basis)).toBe(false);
    expect(billAllocationBasisUnchanged({ amountPaid: 500, paymentIds: ["p1", "p2"] }, basis)).toBe(false);
    expect(billAllocationBasisUnchanged(undefined, basis)).toBe(false);
  });
});
