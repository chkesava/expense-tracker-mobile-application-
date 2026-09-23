import { describe, expect, it } from "vitest";

import type {
  AccountActivity,
  AccountEntry,
  Expense,
  Income,
} from "@/shared/types/expense";
import {
  applyAccountActivityFilters,
  countActiveAccountActivityFilters,
  createEmptyAccountActivityFilters,
  enrichAccountActivities,
  getAccountActivityFilterOptions,
  getAccountActivityFilterValidationError,
} from "./accountActivityFilters";

const activities: AccountActivity[] = [
  {
    id: "expense",
    date: "2026-09-01",
    amount: 500,
    type: "debit",
    linkedExpenseId: "expense",
    category: "Food & Groceries",
  },
  {
    id: "refund",
    date: "2026-09-02",
    amount: 200,
    type: "credit",
    linkedIncomeId: "refund",
    source: "Refund",
  },
  {
    id: "transfer",
    date: "2026-09-03",
    amount: 1_000,
    type: "debit",
    linkedTransferId: "transfer",
    isTransfer: true,
    counterpartyName: "Savings",
  },
  {
    id: "bill",
    date: "2026-09-04",
    amount: 2_000,
    type: "debit",
    linkedPaymentId: "bill",
    isBillPayment: true,
    counterpartyName: "Credit Card",
  },
  {
    id: "investment",
    date: "2026-09-05",
    amount: 5_000,
    type: "debit",
    linkedAccountEntryId: "investment",
  },
  {
    id: "manual",
    date: "2026-09-06",
    amount: 50,
    type: "credit",
    linkedAccountEntryId: "manual",
    isManualEntry: true,
  },
];

const expenses: Expense[] = [
  {
    id: "expense",
    amount: 500,
    category: "Food & Groceries",
    subcategory: "Groceries",
    tags: ["home", "weekly"],
    note: "Vegetables",
    date: "2026-09-01",
    month: "2026-09",
    accountId: "account-a",
    isAudited: true,
    createdAt: "2026-09-01",
  },
  {
    id: "unrelated",
    amount: 800,
    category: "Travel & Holidays",
    tags: ["other-account"],
    note: "Flight",
    date: "2026-09-01",
    month: "2026-09",
    accountId: "account-b",
    createdAt: "2026-09-01",
  },
];

const incomes: Income[] = [
  {
    id: "refund",
    amount: 200,
    source: "Refund",
    note: "Merchant refund",
    date: "2026-09-02",
    month: "2026-09",
    accountId: "account-a",
    createdAt: "2026-09-02",
  },
];

const entries: AccountEntry[] = [
  {
    id: "investment",
    accountId: "account-a",
    amount: 5_000,
    direction: "debit",
    date: "2026-09-05",
    transferId: "investment-transfer",
  },
  {
    id: "manual",
    accountId: "account-a",
    amount: 50,
    direction: "credit",
    date: "2026-09-06",
  },
];

function records() {
  return enrichAccountActivities(activities, expenses, incomes, entries);
}

describe("account activity filters", () => {
  it("classifies canonical income and expense separately from transfer-like flows", () => {
    const enriched = records();
    expect(enriched.map(({ activity, kind }) => [activity.id, kind])).toEqual([
      ["expense", "expense"],
      ["refund", "income"],
      ["transfer", "transfers"],
      ["bill", "transfers"],
      ["investment", "transfers"],
      ["manual", "other"],
    ]);
  });

  it("identifies refunds, investments, and bills from linked metadata", () => {
    const enriched = records();
    expect(enriched.find((record) => record.activity.id === "refund")?.isRefund).toBe(true);
    expect(
      enriched.find((record) => record.activity.id === "investment")?.isInvestment
    ).toBe(true);
    expect(enriched.find((record) => record.activity.id === "bill")?.isBill).toBe(true);
  });

  it("combines dimensions while OR-matching values inside a dimension", () => {
    const filters = createEmptyAccountActivityFilters();
    filters.kind = "expense";
    filters.categories = ["Food & Groceries", "Bills & Communication"];
    filters.tags = ["home"];
    filters.statuses = ["audited"];
    filters.fromDate = "2026-09-01";
    filters.toDate = "2026-09-01";
    filters.minAmount = "400";
    filters.maxAmount = "600";

    expect(
      applyAccountActivityFilters(records(), filters).map(({ activity }) => activity.id)
    ).toEqual(["expense"]);
  });

  it("matches special kinds as alternatives and keeps date and amount boundaries inclusive", () => {
    const filters = createEmptyAccountActivityFilters();
    filters.specialKinds = ["refunds", "bills"];
    filters.fromDate = "2026-09-02";
    filters.toDate = "2026-09-04";
    filters.minAmount = "200";
    filters.maxAmount = "2000";

    expect(
      applyAccountActivityFilters(records(), filters).map(({ activity }) => activity.id)
    ).toEqual(["refund", "bill"]);
  });

  it("combines a canonical kind with a special kind without relabeling transfers", () => {
    const filters = createEmptyAccountActivityFilters();
    filters.kind = "income";
    filters.specialKinds = ["refunds", "bills"];

    expect(
      applyAccountActivityFilters(records(), filters).map(({ activity }) => activity.id)
    ).toEqual(["refund"]);
  });

  it("treats card cashback as a refund without misclassifying it as income", () => {
    const cashback: AccountActivity = {
      id: "cashback",
      date: "2026-09-07",
      amount: 75,
      type: "credit",
      isCashback: true,
      runningBalance: 12_345,
    };
    const [record] = enrichAccountActivities([cashback], [], [], []);
    const filters = createEmptyAccountActivityFilters();
    filters.specialKinds = ["refunds"];

    expect(record.kind).toBe("other");
    expect(applyAccountActivityFilters([record], filters)[0].activity.runningBalance).toBe(
      12_345
    );
  });

  it("filters by counterparty and ignores invalid numeric bounds", () => {
    const filters = createEmptyAccountActivityFilters();
    filters.counterparties = ["Savings"];
    filters.minAmount = "not-a-number";

    expect(
      applyAccountActivityFilters(records(), filters).map(({ activity }) => activity.id)
    ).toEqual(["transfer"]);
  });

  it("derives options only from scoped activities without leaking other-account metadata", () => {
    expect(getAccountActivityFilterOptions(records())).toEqual({
      categories: ["Food & Groceries"],
      counterparties: ["Credit Card", "Savings"],
      // SPENDLY-109: account-detail activities carry no `accountName`, so the
      // Journal's facet stays empty here and its modal section self-hides.
      accounts: [],
      tags: ["home", "weekly"],
      statuses: ["audited"],
    });
  });

  it("creates independent defaults and counts every removable criterion", () => {
    const first = createEmptyAccountActivityFilters();
    const second = createEmptyAccountActivityFilters();
    first.categories.push("Food & Groceries");
    first.kind = "expense";
    first.fromDate = "2026-09-01";

    expect(second).toEqual(createEmptyAccountActivityFilters());
    expect(countActiveAccountActivityFilters(first)).toBe(3);
  });

  it("validates custom dates and amount ranges before applying", () => {
    const filters = createEmptyAccountActivityFilters();
    filters.fromDate = "2026-09-31";
    expect(getAccountActivityFilterValidationError(filters)).toBe(
      "From date must use YYYY-MM-DD."
    );

    filters.fromDate = "2026-09-05";
    filters.toDate = "2026-09-01";
    expect(getAccountActivityFilterValidationError(filters)).toBe(
      "From date cannot be after To date."
    );

    filters.toDate = "";
    filters.minAmount = "500";
    filters.maxAmount = "100";
    expect(getAccountActivityFilterValidationError(filters)).toBe(
      "Minimum amount cannot exceed maximum amount."
    );
  });
});
