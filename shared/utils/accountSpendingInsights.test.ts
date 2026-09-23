import { describe, expect, it } from "vitest";

import type {
  AccountActivity,
  AccountEntry,
  Expense,
  Income,
} from "@/shared/types/expense";
import { enrichAccountActivities } from "./accountActivityFilters";
import {
  computeAccountSpendingInsights,
  UNCATEGORIZED,
} from "./accountSpendingInsights";

const ANCHOR = "2026-09";

function build(
  activities: AccountActivity[],
  expenses: Expense[] = [],
  incomes: Income[] = [],
  entries: AccountEntry[] = []
) {
  return enrichAccountActivities(activities, expenses, incomes, entries);
}

function expenseRow(
  id: string,
  date: string,
  amount: number,
  category?: string,
  counterpartyName?: string
): AccountActivity {
  return {
    id,
    date,
    amount,
    type: "debit",
    linkedExpenseId: id,
    // buildAccountActivities() copies the expense note onto the activity, and
    // activityTitle() reads it from there.
    note: category ? `${category} spend` : undefined,
    category,
    counterpartyName,
  };
}

function expenseDoc(id: string, date: string, amount: number, category: string): Expense {
  return {
    id,
    amount,
    category,
    note: `${category} spend`,
    date,
    month: date.slice(0, 7),
    accountId: "account-a",
    createdAt: date,
  };
}

describe("account spending insights", () => {
  describe("category breakdown", () => {
    const activities = [
      expenseRow("food-1", "2026-09-10", 3_000, "Food & Groceries"),
      expenseRow("food-2", "2026-09-05", 1_000, "Food & Groceries"),
      expenseRow("travel-1", "2026-08-20", 2_000, "Travel & Holidays"),
    ];
    const expenses = [
      expenseDoc("food-1", "2026-09-10", 3_000, "Food & Groceries"),
      expenseDoc("food-2", "2026-09-05", 1_000, "Food & Groceries"),
      expenseDoc("travel-1", "2026-08-20", 2_000, "Travel & Holidays"),
    ];

    it("totals and ranks categories by spend", () => {
      const insights = computeAccountSpendingInsights(
        build(activities, expenses),
        6,
        { anchorMonth: ANCHOR }
      );
      expect(insights.totalSpend).toBe(6_000);
      expect(insights.categories).toEqual([
        {
          category: "Food & Groceries",
          amount: 4_000,
          count: 2,
          share: 4_000 / 6_000,
        },
        {
          category: "Travel & Holidays",
          amount: 2_000,
          count: 1,
          share: 2_000 / 6_000,
        },
      ]);
    });

    it("names the largest category and the largest single expense", () => {
      const insights = computeAccountSpendingInsights(
        build(activities, expenses),
        6,
        { anchorMonth: ANCHOR }
      );
      expect(insights.largestCategory?.category).toBe("Food & Groceries");
      expect(insights.largestExpense).toEqual({
        id: "food-1",
        title: "Food & Groceries spend",
        category: "Food & Groceries",
        amount: 3_000,
        date: "2026-09-10",
      });
    });
  });

  describe("uncategorized spending", () => {
    it("groups spending with no category under a single label", () => {
      const insights = computeAccountSpendingInsights(
        build([
          expenseRow("no-cat-1", "2026-09-10", 500),
          expenseRow("no-cat-2", "2026-09-11", 250),
          expenseRow("blank-cat", "2026-09-12", 100, "   "),
        ]),
        6,
        { anchorMonth: ANCHOR }
      );
      expect(insights.categories).toHaveLength(1);
      expect(insights.categories[0]).toMatchObject({
        category: UNCATEGORIZED,
        amount: 850,
        count: 3,
      });
      expect(insights.largestExpense?.category).toBe(UNCATEGORIZED);
    });
  });

  describe("transfers", () => {
    it("never counts money movement as spending", () => {
      const insights = computeAccountSpendingInsights(
        build([
          {
            id: "transfer",
            date: "2026-09-10",
            amount: 20_000,
            type: "debit",
            linkedTransferId: "transfer",
            isTransfer: true,
            counterpartyName: "Savings",
          },
          {
            id: "bill",
            date: "2026-09-09",
            amount: 8_000,
            type: "debit",
            linkedPaymentId: "bill",
            isBillPayment: true,
            counterpartyName: "Axis Card",
          },
          expenseRow("real", "2026-09-08", 1_000, "Food & Groceries"),
        ]),
        6,
        { anchorMonth: ANCHOR }
      );
      expect(insights.totalSpend).toBe(1_000);
      expect(insights.categories).toHaveLength(1);
      expect(insights.largestExpense?.id).toBe("real");
    });
  });

  describe("refunds and cashback", () => {
    const records = build(
      [
        expenseRow("spend", "2026-09-10", 2_000, "Food & Groceries"),
        {
          id: "refund",
          date: "2026-09-11",
          amount: 500,
          type: "credit",
          linkedIncomeId: "refund",
          source: "Swiggy Refund",
        },
        {
          id: "cashback",
          date: "2026-09-12",
          amount: 250,
          type: "credit",
          linkedPaymentId: "cashback",
          isCashback: true,
        },
        {
          id: "salary",
          date: "2026-09-01",
          amount: 50_000,
          type: "credit",
          linkedIncomeId: "salary",
          source: "Salary",
        },
      ],
      [],
      [
        {
          id: "refund",
          amount: 500,
          source: "Swiggy Refund",
          note: "Order cancelled",
          date: "2026-09-11",
          month: "2026-09",
          accountId: "account-a",
          createdAt: "2026-09-11",
        },
        {
          id: "salary",
          amount: 50_000,
          source: "Salary",
          note: "Monthly salary",
          date: "2026-09-01",
          month: "2026-09",
          accountId: "account-a",
          createdAt: "2026-09-01",
        },
      ]
    );

    it("keeps refunds and cashback out of income", () => {
      const insights = computeAccountSpendingInsights(records, 6, {
        anchorMonth: ANCHOR,
      });
      expect(insights.totalIncome).toBe(50_000);
      expect(insights.refundsTotal).toBe(750);
      expect(insights.incomeSources).toEqual([
        { name: "Salary", amount: 50_000, count: 1 },
      ]);
    });

    it("does not let a refund reduce or inflate spending", () => {
      const insights = computeAccountSpendingInsights(records, 6, {
        anchorMonth: ANCHOR,
      });
      expect(insights.totalSpend).toBe(2_000);
    });
  });

  describe("income sources", () => {
    it("totals and ranks sources", () => {
      const insights = computeAccountSpendingInsights(
        build(
          [
            {
              id: "salary",
              date: "2026-09-01",
              amount: 50_000,
              type: "credit",
              linkedIncomeId: "salary",
              source: "Salary",
            },
            {
              id: "freelance",
              date: "2026-09-14",
              amount: 12_000,
              type: "credit",
              linkedIncomeId: "freelance",
              source: "Freelance",
            },
          ],
          [],
          [
            {
              id: "salary",
              amount: 50_000,
              source: "Salary",
              note: "Monthly salary",
              date: "2026-09-01",
              month: "2026-09",
              accountId: "account-a",
              createdAt: "2026-09-01",
            },
            {
              id: "freelance",
              amount: 12_000,
              source: "Freelance",
              note: "Project",
              date: "2026-09-14",
              month: "2026-09",
              accountId: "account-a",
              createdAt: "2026-09-14",
            },
          ]
        ),
        6,
        { anchorMonth: ANCHOR }
      );
      expect(insights.incomeSources.map((s) => s.name)).toEqual([
        "Salary",
        "Freelance",
      ]);
    });
  });

  describe("counterparties", () => {
    it("ranks spending counterparties when they are recorded", () => {
      const insights = computeAccountSpendingInsights(
        build([
          expenseRow("a", "2026-09-10", 900, "Shopping", "Amazon"),
          expenseRow("b", "2026-09-11", 300, "Shopping", "Amazon"),
          expenseRow("c", "2026-09-12", 600, "Shopping", "Flipkart"),
        ]),
        6,
        { anchorMonth: ANCHOR }
      );
      expect(insights.topCounterparties).toEqual([
        { name: "Amazon", amount: 1_200, count: 2 },
        { name: "Flipkart", amount: 600, count: 1 },
      ]);
    });

    it("reports none when no counterparty is recorded", () => {
      const insights = computeAccountSpendingInsights(
        build([expenseRow("a", "2026-09-10", 900, "Shopping")]),
        6,
        { anchorMonth: ANCHOR }
      );
      expect(insights.topCounterparties).toEqual([]);
    });
  });

  describe("previous-period comparison", () => {
    it("compares against an equal-length preceding period", () => {
      const insights = computeAccountSpendingInsights(
        build([
          // Current window: Jul-Sep
          expenseRow("now", "2026-09-10", 3_000, "Food & Groceries"),
          // Previous window: Apr-Jun
          expenseRow("then", "2026-06-10", 2_000, "Food & Groceries"),
          // Outside both windows
          expenseRow("ancient", "2026-03-10", 9_000, "Food & Groceries"),
        ]),
        3,
        { anchorMonth: ANCHOR }
      );
      expect(insights.months).toEqual(["2026-09", "2026-08", "2026-07"]);
      expect(insights.previousMonths).toEqual([
        "2026-06",
        "2026-05",
        "2026-04",
      ]);
      expect(insights.months).toHaveLength(insights.previousMonths.length);
      expect(insights.spendComparison).toEqual({
        current: 3_000,
        previous: 2_000,
        delta: 1_000,
        changeRatio: 0.5,
      });
    });

    it("gives no ratio when the previous period had nothing", () => {
      const insights = computeAccountSpendingInsights(
        build([expenseRow("now", "2026-09-10", 3_000, "Food & Groceries")]),
        3,
        { anchorMonth: ANCHOR }
      );
      expect(insights.spendComparison.previous).toBe(0);
      expect(insights.spendComparison.delta).toBe(3_000);
      expect(insights.spendComparison.changeRatio).toBeUndefined();
    });

    it("reports a fall as a negative delta", () => {
      const insights = computeAccountSpendingInsights(
        build([
          expenseRow("now", "2026-09-10", 1_000, "Food & Groceries"),
          expenseRow("then", "2026-06-10", 4_000, "Food & Groceries"),
        ]),
        3,
        { anchorMonth: ANCHOR }
      );
      expect(insights.spendComparison.delta).toBe(-3_000);
      expect(insights.spendComparison.changeRatio).toBe(-0.75);
    });
  });

  describe("zero data", () => {
    it("reports empty insights for an account with no activity", () => {
      const insights = computeAccountSpendingInsights([], 6, {
        anchorMonth: ANCHOR,
      });
      expect(insights.totalSpend).toBe(0);
      expect(insights.totalIncome).toBe(0);
      expect(insights.refundsTotal).toBe(0);
      expect(insights.categories).toEqual([]);
      expect(insights.largestCategory).toBeUndefined();
      expect(insights.largestExpense).toBeUndefined();
      expect(insights.incomeSources).toEqual([]);
      expect(insights.topCounterparties).toEqual([]);
      expect(insights.spendComparison).toEqual({
        current: 0,
        previous: 0,
        delta: 0,
        changeRatio: undefined,
      });
    });

    it("keeps shares at zero rather than dividing by zero", () => {
      const insights = computeAccountSpendingInsights(
        build([
          {
            id: "transfer",
            date: "2026-09-10",
            amount: 5_000,
            type: "debit",
            linkedTransferId: "transfer",
            isTransfer: true,
          },
        ]),
        6,
        { anchorMonth: ANCHOR }
      );
      expect(insights.totalSpend).toBe(0);
      expect(insights.categories).toEqual([]);
    });
  });
});
