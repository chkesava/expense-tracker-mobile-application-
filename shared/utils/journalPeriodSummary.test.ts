import { describe, expect, it } from "vitest";

import type { AccountType, Expense, Income } from "@/shared/types/expense";
import {
  buildJournalRecords,
  type JournalAccount,
} from "./journalActivities";
import {
  emptyJournalTotals,
  summarizeJournalPeriods,
  summarizeJournalTotals,
} from "./journalPeriodSummary";

const accounts: JournalAccount[] = [
  { id: "acc-bank", name: "HDFC", displayName: "HDFC Savings", typeId: "t-bank" },
  { id: "acc-card", name: "Amex", displayName: "Amex Card", typeId: "t-credit" },
];

const accountTypes: Pick<AccountType, "id" | "name">[] = [
  { id: "t-bank", name: "Bank Account" },
  { id: "t-credit", name: "Credit Card" },
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

describe("journal period summary (SPENDLY-111)", () => {
  describe("totals", () => {
    it("computes spent, income and net", () => {
      const totals = summarizeJournalTotals(
        build(
          [
            expense({ id: "a", amount: 500 }),
            expense({ id: "b", amount: 250 }),
          ],
          [income({ id: "c", amount: 1_000 })]
        )
      );
      expect(totals.spent).toBe(750);
      expect(totals.income).toBe(1_000);
      expect(totals.net).toBe(250);
      expect(totals.transactionCount).toBe(3);
    });

    it("counts card spend inside spent and breaks it out", () => {
      const totals = summarizeJournalTotals(
        build([
          expense({ id: "bank", amount: 200 }),
          expense({ id: "card", amount: 800, accountId: "acc-card" }),
        ])
      );
      // A card purchase is real spending...
      expect(totals.spent).toBe(1_000);
      expect(totals.cardSpent).toBe(800);
      // ...but it is not cash leaving a bank.
      expect(totals.cashOut).toBe(200);
      expect(totals.netCash).toBe(-200);
    });

    it("keeps cash figures separate from accrual figures", () => {
      const totals = summarizeJournalTotals(
        build(
          [expense({ id: "card", amount: 900, accountId: "acc-card" })],
          [income({ id: "pay", amount: 1_000 })]
        )
      );
      expect(totals.spent).toBe(900);
      expect(totals.net).toBe(100);
      expect(totals.cashIn).toBe(1_000);
      expect(totals.cashOut).toBe(0);
      expect(totals.netCash).toBe(1_000);
    });

    it("never inflates totals with transfers, bill payments or cashback", () => {
      // Those are AccountTransfer / AccountPayment rows and are structurally
      // absent from the Journal, so the guarantee is that the record count is
      // exactly the expense + income count and nothing else contributed.
      const records = build(
        [expense({ id: "a", amount: 100 })],
        [income({ id: "b", amount: 300 })]
      );
      const totals = summarizeJournalTotals(records);
      expect(records).toHaveLength(2);
      expect(totals.transactionCount).toBe(2);
      expect(totals.spent).toBe(100);
      expect(totals.income).toBe(300);
    });

    it("excludes soft-deleted rows", () => {
      const totals = summarizeJournalTotals(
        build([
          expense({ id: "live", amount: 100 }),
          expense({ id: "dead", amount: 9_999, deletedAt: "2026-09-11" }),
        ])
      );
      expect(totals.spent).toBe(100);
      expect(totals.transactionCount).toBe(1);
    });

    it("rounds away float residue", () => {
      const totals = summarizeJournalTotals(
        build([
          expense({ id: "a", amount: 0.1 }),
          expense({ id: "b", amount: 0.2 }),
        ])
      );
      expect(totals.spent).toBe(0.3);
    });

    it("returns zeroes for no rows", () => {
      expect(summarizeJournalTotals([])).toEqual(emptyJournalTotals());
    });

    it("keeps net equal to income minus spent for every shape", () => {
      const totals = summarizeJournalTotals(
        build(
          [
            expense({ id: "a", amount: 33.33 }),
            expense({ id: "b", amount: 66.67, accountId: "acc-card" }),
          ],
          [income({ id: "c", amount: 10.5 })]
        )
      );
      expect(totals.net).toBe(totals.income - totals.spent);
      expect(totals.netCash).toBe(totals.cashIn - totals.cashOut);
    });
  });

  describe("monthly buckets", () => {
    it("buckets by calendar month, newest first", () => {
      const periods = summarizeJournalPeriods(
        build([
          expense({ id: "sep", amount: 100, date: "2026-09-10", month: "2026-09" }),
          expense({ id: "aug", amount: 200, date: "2026-08-10", month: "2026-08" }),
          expense({ id: "oct", amount: 300, date: "2026-10-10", month: "2026-10" }),
        ]),
        "month"
      );
      expect(periods.map((p) => p.key)).toEqual(["2026-10", "2026-09", "2026-08"]);
      expect(periods[0].spent).toBe(300);
    });

    it("reports correct month bounds, including short and leap months", () => {
      const periods = summarizeJournalPeriods(
        build([
          expense({ id: "feb", amount: 10, date: "2024-02-15", month: "2024-02" }),
          expense({ id: "apr", amount: 10, date: "2026-04-15", month: "2026-04" }),
        ]),
        "month"
      );
      const byKey = new Map(periods.map((p) => [p.key, p]));
      expect(byKey.get("2024-02")).toMatchObject({
        fromDate: "2024-02-01",
        toDate: "2024-02-29",
      });
      expect(byKey.get("2026-04")).toMatchObject({
        fromDate: "2026-04-01",
        toDate: "2026-04-30",
      });
    });

    it("includes rows on the first and last day of a month", () => {
      const periods = summarizeJournalPeriods(
        build([
          expense({ id: "first", amount: 10, date: "2026-09-01" }),
          expense({ id: "last", amount: 20, date: "2026-09-30" }),
        ]),
        "month"
      );
      expect(periods).toHaveLength(1);
      expect(periods[0].spent).toBe(30);
      expect(periods[0].transactionCount).toBe(2);
    });

    it("puts rows one day either side into neighbouring months", () => {
      const periods = summarizeJournalPeriods(
        build([
          expense({ id: "aug31", amount: 10, date: "2026-08-31" }),
          expense({ id: "oct01", amount: 20, date: "2026-10-01" }),
        ]),
        "month"
      );
      expect(periods.map((p) => p.key)).toEqual(["2026-10", "2026-08"]);
    });

    it("buckets by the row's date rather than its stored month field", () => {
      // `date` is authoritative — the same call SPENDLY-109 made.
      const periods = summarizeJournalPeriods(
        build([expense({ id: "x", amount: 10, date: "2026-09-10", month: "2026-01" })]),
        "month"
      );
      expect(periods.map((p) => p.key)).toEqual(["2026-09"]);
    });
  });

  describe("weekly buckets", () => {
    it("starts weeks on Monday by default", () => {
      // 2026-09-10 is a Thursday; its Monday is 2026-09-07.
      const periods = summarizeJournalPeriods(
        build([expense({ id: "thu", amount: 10, date: "2026-09-10" })]),
        "week"
      );
      expect(periods[0].key).toBe("2026-09-07");
      expect(periods[0].fromDate).toBe("2026-09-07");
      expect(periods[0].toDate).toBe("2026-09-13");
    });

    it("honours a Sunday week start", () => {
      const periods = summarizeJournalPeriods(
        build([expense({ id: "thu", amount: 10, date: "2026-09-10" })]),
        "week",
        { firstDayOfWeek: "sunday" }
      );
      expect(periods[0].key).toBe("2026-09-06");
      expect(periods[0].toDate).toBe("2026-09-12");
    });

    it("splits rows either side of a week boundary", () => {
      const periods = summarizeJournalPeriods(
        build([
          expense({ id: "sun", amount: 10, date: "2026-09-06" }),
          expense({ id: "mon", amount: 20, date: "2026-09-07" }),
        ]),
        "week"
      );
      expect(periods.map((p) => p.key)).toEqual(["2026-09-07", "2026-08-31"]);
    });

    it("groups a whole Monday-to-Sunday week together", () => {
      const periods = summarizeJournalPeriods(
        build([
          expense({ id: "mon", amount: 10, date: "2026-09-07" }),
          expense({ id: "sun", amount: 20, date: "2026-09-13" }),
        ]),
        "week"
      );
      expect(periods).toHaveLength(1);
      expect(periods[0].spent).toBe(30);
    });
  });

  describe("daily buckets", () => {
    it("buckets by exact date, newest first", () => {
      const periods = summarizeJournalPeriods(
        build([
          expense({ id: "a", amount: 10, date: "2026-09-10" }),
          expense({ id: "b", amount: 20, date: "2026-09-11" }),
        ]),
        "day"
      );
      expect(periods.map((p) => p.key)).toEqual(["2026-09-11", "2026-09-10"]);
      expect(periods[0].fromDate).toBe(periods[0].toDate);
    });

    it("emits only days that have rows", () => {
      const periods = summarizeJournalPeriods(
        build([
          expense({ id: "a", amount: 10, date: "2026-09-01" }),
          expense({ id: "b", amount: 20, date: "2026-09-20" }),
        ]),
        "day"
      );
      expect(periods).toHaveLength(2);
    });
  });

  describe("reconciliation", () => {
    it("sums bucket totals back to the overall totals", () => {
      const records = build(
        [
          expense({ id: "a", amount: 100, date: "2026-09-10" }),
          expense({ id: "b", amount: 250, date: "2026-08-10" }),
          expense({ id: "c", amount: 75, date: "2026-08-20", accountId: "acc-card" }),
        ],
        [
          income({ id: "d", amount: 1_000, date: "2026-09-01" }),
          income({ id: "e", amount: 500, date: "2026-08-01" }),
        ]
      );
      const totals = summarizeJournalTotals(records);
      const periods = summarizeJournalPeriods(records, "month");

      const sum = (pick: (p: (typeof periods)[number]) => number) =>
        periods.reduce((acc, p) => acc + pick(p), 0);

      expect(sum((p) => p.spent)).toBe(totals.spent);
      expect(sum((p) => p.income)).toBe(totals.income);
      expect(sum((p) => p.cardSpent)).toBe(totals.cardSpent);
      expect(sum((p) => p.cashIn)).toBe(totals.cashIn);
      expect(sum((p) => p.cashOut)).toBe(totals.cashOut);
      expect(sum((p) => p.transactionCount)).toBe(totals.transactionCount);
    });

    it("gives the same totals at every granularity", () => {
      const records = build(
        [
          expense({ id: "a", amount: 100, date: "2026-09-10" }),
          expense({ id: "b", amount: 250, date: "2026-09-11" }),
        ],
        [income({ id: "c", amount: 400, date: "2026-09-12" })]
      );
      const spentAt = (g: "day" | "week" | "month") =>
        summarizeJournalPeriods(records, g).reduce((acc, p) => acc + p.spent, 0);

      expect(spentAt("day")).toBe(350);
      expect(spentAt("week")).toBe(350);
      expect(spentAt("month")).toBe(350);
    });
  });

  describe("large datasets", () => {
    it("buckets 25k rows across months in one pass", () => {
      const many = Array.from({ length: 25_000 }, (_, i) =>
        expense({
          id: `e${i}`,
          amount: 1,
          date: i % 2 === 0 ? "2026-09-10" : "2026-08-10",
        })
      );
      const periods = summarizeJournalPeriods(build(many), "month");
      expect(periods.map((p) => p.key)).toEqual(["2026-09", "2026-08"]);
      expect(periods[0].transactionCount + periods[1].transactionCount).toBe(25_000);
      expect(periods[0].spent + periods[1].spent).toBe(25_000);
    });
  });
});
