import { describe, expect, it } from "vitest";

import type { AccountType, Expense, Income } from "@/shared/types/expense";
import {
  buildJournalRecords,
  type JournalAccount,
} from "./journalActivities";
import {
  buildJournalRunningBalance,
  journalCashFlowById,
  journalCashImpact,
} from "./journalRunningBalance";

const accounts: JournalAccount[] = [
  { id: "acc-bank", name: "HDFC", displayName: "HDFC Savings", typeId: "t-bank" },
  { id: "acc-card", name: "Amex", displayName: "Amex Card", typeId: "t-credit" },
  { id: "acc-cash", name: "Wallet", displayName: "Wallet", typeId: "t-other" },
];

const accountTypes: Pick<AccountType, "id" | "name">[] = [
  { id: "t-bank", name: "Bank Account" },
  { id: "t-credit", name: "Credit Card" },
  { id: "t-other", name: "Cash" },
];

function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: "e1",
    amount: 500,
    category: "Food",
    note: "lunch",
    date: "2026-09-10",
    month: "2026-09",
    accountId: "acc-bank",
    createdAt: null,
    ...over,
  } as Expense;
}

function income(over: Partial<Income> = {}): Income {
  return {
    id: "i1",
    amount: 1_000,
    source: "Payroll",
    note: "",
    date: "2026-09-01",
    month: "2026-09",
    accountId: "acc-bank",
    createdAt: null,
    ...over,
  } as Income;
}

function build(expenses: Expense[], incomes: Income[] = []) {
  return buildJournalRecords(expenses, incomes, accounts, { accountTypes });
}

describe("journal running balance (SPENDLY-111)", () => {
  describe("cash impact", () => {
    it("treats a bank expense as cash out", () => {
      const [record] = build([expense({ amount: 500 })]);
      expect(journalCashImpact(record)).toEqual({ cash: -500, card: 0 });
    });

    it("treats bank income as cash in", () => {
      const [record] = build([], [income({ amount: 1_000 })]);
      expect(journalCashImpact(record)).toEqual({ cash: 1_000, card: 0 });
    });

    it("never treats a credit-card purchase as cash", () => {
      const [record] = build([expense({ accountId: "acc-card", amount: 750 })]);
      expect(journalCashImpact(record)).toEqual({ cash: 0, card: 750 });
    });

    it("treats a credit posted to a card as reducing the card, not as cash", () => {
      const [record] = build([], [income({ accountId: "acc-card", amount: 200 })]);
      expect(journalCashImpact(record)).toEqual({ cash: 0, card: -200 });
    });

    it("treats an account-less expense as cash out", () => {
      const [record] = build([expense({ accountId: undefined, amount: 60 })]);
      expect(journalCashImpact(record)).toEqual({ cash: -60, card: 0 });
    });

    it("treats a wallet / cash account as cash, not credit", () => {
      const [record] = build([expense({ accountId: "acc-cash", amount: 40 })]);
      expect(journalCashImpact(record)).toEqual({ cash: -40, card: 0 });
    });

    it("falls back to cash when account types were not supplied", () => {
      // Without types nothing can be proven to be a card; cash is the safe
      // default because the common account-less row is genuinely cash.
      const [record] = buildJournalRecords(
        [expense({ accountId: "acc-card", amount: 750 })],
        [],
        accounts
      );
      expect(journalCashImpact(record)).toEqual({ cash: -750, card: 0 });
    });
  });

  describe("accumulation", () => {
    it("accumulates oldest to newest and returns newest first", () => {
      const balance = buildJournalRunningBalance(
        build(
          [
            expense({ id: "e-rent", amount: 250, date: "2026-09-02" }),
            expense({ id: "e-food", amount: 100, date: "2026-09-03" }),
          ],
          [income({ id: "i-pay", amount: 1_000, date: "2026-09-01" })]
        )
      );

      expect(balance.rows.map((r) => r.record.activity.id)).toEqual([
        "e-food",
        "e-rent",
        "i-pay",
      ]);
      // Newest row carries the final figure.
      expect(balance.rows[0].cashFlowToDate).toBe(650);
      expect(balance.rows[1].cashFlowToDate).toBe(750);
      expect(balance.rows[2].cashFlowToDate).toBe(1_000);
      expect(balance.netCashFlow).toBe(650);
    });

    it("reconciles: the newest row's figure equals the net cash flow", () => {
      const balance = buildJournalRunningBalance(
        build(
          [
            expense({ id: "a", amount: 120.35, date: "2026-09-04" }),
            expense({ id: "b", amount: 80.15, date: "2026-09-05" }),
          ],
          [income({ id: "c", amount: 500.5, date: "2026-09-01" })]
        )
      );
      expect(balance.rows[0].cashFlowToDate).toBe(balance.netCashFlow);
      expect(balance.netCashFlow).toBe(300);
    });

    it("keeps card spend out of the cash line entirely", () => {
      const balance = buildJournalRunningBalance(
        build(
          [
            expense({ id: "e-bank", amount: 200, date: "2026-09-02" }),
            expense({
              id: "e-card",
              amount: 900,
              date: "2026-09-03",
              accountId: "acc-card",
            }),
          ],
          [income({ id: "i-pay", amount: 1_000, date: "2026-09-01" })]
        )
      );

      expect(balance.netCashFlow).toBe(800);
      expect(balance.cardSpend).toBe(900);
      // The card row must not move the cash line at all.
      const cardRow = balance.rows.find((r) => r.record.activity.id === "e-card");
      const bankRow = balance.rows.find((r) => r.record.activity.id === "e-bank");
      expect(cardRow?.cashFlowToDate).toBe(bankRow?.cashFlowToDate);
    });

    it("rounds after every step so float residue cannot accumulate", () => {
      const balance = buildJournalRunningBalance(
        build(
          Array.from({ length: 3 }, (_, i) =>
            expense({ id: `e${i}`, amount: 0.1, date: `2026-09-0${i + 1}` })
          )
        )
      );
      expect(balance.netCashFlow).toBe(-0.3);
      expect(balance.rows.every((r) => Number.isFinite(r.cashFlowToDate))).toBe(true);
    });

    it("returns an empty, zeroed result for no rows", () => {
      const balance = buildJournalRunningBalance([]);
      expect(balance.rows).toEqual([]);
      expect(balance.netCashFlow).toBe(0);
      expect(balance.cardSpend).toBe(0);
    });
  });

  describe("date and time boundaries", () => {
    it("orders same-day rows by clock time", () => {
      const balance = buildJournalRunningBalance(
        build([
          expense({ id: "morning", amount: 10, date: "2026-09-10", time: "09:00 AM" }),
          expense({ id: "evening", amount: 20, date: "2026-09-10", time: "08:00 PM" }),
        ])
      );
      // Newest first: the evening row leads and carries the final figure.
      expect(balance.rows.map((r) => r.record.activity.id)).toEqual([
        "evening",
        "morning",
      ]);
      expect(balance.rows[0].cashFlowToDate).toBe(-30);
      expect(balance.rows[1].cashFlowToDate).toBe(-10);
    });

    it("breaks exact ties deterministically by id", () => {
      const first = buildJournalRunningBalance(
        build([
          expense({ id: "aaa", amount: 10, date: "2026-09-10" }),
          expense({ id: "bbb", amount: 20, date: "2026-09-10" }),
        ])
      );
      const reversed = buildJournalRunningBalance(
        build([
          expense({ id: "bbb", amount: 20, date: "2026-09-10" }),
          expense({ id: "aaa", amount: 10, date: "2026-09-10" }),
        ])
      );
      expect(first.rows.map((r) => r.record.activity.id)).toEqual(
        reversed.rows.map((r) => r.record.activity.id)
      );
    });

    it("orders same-day untimed rows by createdAt, as the list does", () => {
      // ExpenseList sorts with postingSortMs(date, time, createdAt). If this
      // accumulated in a different order the figures would not step
      // monotonically down the rendered list.
      const balance = buildJournalRunningBalance(
        build([
          expense({
            id: "later",
            amount: 20,
            date: "2026-09-10",
            time: undefined,
            createdAt: "2026-09-10T18:00:00.000Z",
          }),
          expense({
            id: "earlier",
            amount: 10,
            date: "2026-09-10",
            time: undefined,
            createdAt: "2026-09-10T06:00:00.000Z",
          }),
        ])
      );
      expect(balance.rows.map((r) => r.record.activity.id)).toEqual([
        "later",
        "earlier",
      ]);
      expect(balance.rows[1].cashFlowToDate).toBe(-10);
      expect(balance.rows[0].cashFlowToDate).toBe(-30);
    });

    it("steps monotonically down the rendered order for one-directional rows", () => {
      const balance = buildJournalRunningBalance(
        build(
          Array.from({ length: 5 }, (_, i) =>
            expense({ id: `e${i}`, amount: 10, date: `2026-09-0${i + 1}` })
          )
        )
      );
      const figures = balance.rows.map((r) => r.cashFlowToDate);
      // Newest-first, all outgoing: each row is less negative than the one above.
      for (let i = 1; i < figures.length; i += 1) {
        expect(figures[i]).toBeGreaterThan(figures[i - 1]);
      }
    });

    it("does not mutate the input array order", () => {
      const records = build([
        expense({ id: "b", date: "2026-09-02" }),
        expense({ id: "a", date: "2026-09-01" }),
      ]);
      const before = records.map((r) => r.activity.id);
      buildJournalRunningBalance(records);
      expect(records.map((r) => r.activity.id)).toEqual(before);
    });

    it("spans a month boundary in one continuous line", () => {
      const balance = buildJournalRunningBalance(
        build(
          [expense({ id: "oct", amount: 100, date: "2026-10-01" })],
          [income({ id: "sep", amount: 400, date: "2026-09-30" })]
        )
      );
      expect(balance.rows[0].cashFlowToDate).toBe(300);
      expect(balance.netCashFlow).toBe(300);
    });
  });

  describe("journalCashFlowById", () => {
    it("maps every row's activity id to its cumulative figure", () => {
      const balance = buildJournalRunningBalance(
        build(
          [expense({ id: "e-a", amount: 100, date: "2026-09-02" })],
          [income({ id: "i-a", amount: 300, date: "2026-09-01" })]
        )
      );
      const byId = journalCashFlowById(balance);
      expect(byId.get("i-a")).toBe(300);
      expect(byId.get("e-a")).toBe(200);
      expect(byId.size).toBe(2);
    });
  });

  describe("large datasets", () => {
    it("accumulates 20k rows without drift", () => {
      const many = Array.from({ length: 20_000 }, (_, i) =>
        expense({ id: `e${i}`, amount: 0.01, date: "2026-09-10" })
      );
      const balance = buildJournalRunningBalance(build(many));
      expect(balance.rows).toHaveLength(20_000);
      expect(balance.netCashFlow).toBe(-200);
    });
  });
});
