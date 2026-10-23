import { describe, expect, it } from "vitest";

import type { AccountTransfer, Expense, Income } from "@/shared/types/expense";
import { createEmptyAccountActivityFilters } from "./accountActivityFilters";
import { runJournalFilterPipeline } from "./journalFilterPipeline";
import {
  buildTransactionsFeed,
  feedRowHref,
  groupFeedByDay,
  monthsInScope,
  relativeDayLabel,
  sortFeedRows,
  transactionsHref,
  transferRecords,
  type TransactionsFeedInput,
} from "./transactionsFeed";

const ACCOUNTS = [
  { id: "hdfc", name: "HDFC Savings", displayName: "HDFC Savings" },
  { id: "card", name: "Axis Card", displayName: "Axis Card" },
];

const exp = (p: Partial<Expense>): Expense => ({
  id: "x",
  amount: 100,
  category: "Food",
  note: "",
  date: "2026-10-05",
  month: "2026-10",
  createdAt: null,
  accountId: "hdfc",
  ...p,
});
const inc = (p: Partial<Income>): Income =>
  ({ id: "i", amount: 1000, source: "Salary", note: "", date: "2026-10-01", month: "2026-10", createdAt: null, accountId: "hdfc", ...p }) as Income;

const EXPENSES = [
  exp({ id: "e1", amount: 250, note: "DMart groceries", date: "2026-10-22", time: "19:24" }),
  exp({ id: "e2", amount: 1200, category: "Bills", note: "Electricity", date: "2026-10-21", accountId: "card" }),
  exp({ id: "e3", amount: 80, note: "Tea", date: "2026-10-22", time: "09:10" }),
  exp({ id: "e-del", amount: 999, note: "deleted", date: "2026-10-20", deletedAt: "2026-10-20T00:00:00Z" }),
  exp({ id: "e-sep", amount: 70, note: "September", date: "2026-09-30", month: "2026-09" }),
];
const INCOMES = [inc({ id: "i1", amount: 50000, date: "2026-10-01" })];
const TRANSFERS: AccountTransfer[] = [
  { id: "t1", fromAccountId: "hdfc", toAccountId: "card", amount: 5000, date: "2026-10-21", note: "Card bill" },
  { id: "t-sep", fromAccountId: "hdfc", toAccountId: "card", amount: 300, date: "2026-09-15" },
  { id: "t-gone", fromAccountId: "hdfc", toAccountId: "closed", amount: 40, date: "2026-10-03" },
];

const base: TransactionsFeedInput = {
  expenses: EXPENSES,
  incomes: INCOMES,
  transfers: TRANSFERS,
  accounts: ACCOUNTS,
  query: "",
  filters: createEmptyAccountActivityFilters(),
  monthKey: "2026-10",
  tab: "all",
  sort: "newest",
};

describe("buildTransactionsFeed", () => {
  it("lists the month's live rows plus its transfers, and counts each tab", () => {
    const feed = buildTransactionsFeed(base);
    const ids = feed.rows.map((r) => r.record.activity.id);
    expect(ids).not.toContain("e-del");
    expect(ids).not.toContain("e-sep");
    expect(ids).not.toContain("t-sep");
    expect(feed.counts).toEqual({ all: 6, expenses: 3, income: 1, transfers: 2 });
  });

  it("keeps transfers out of spent and income — the Journal's totals, unchanged", () => {
    const feed = buildTransactionsFeed(base);
    const journal = runJournalFilterPipeline({
      expenses: EXPENSES,
      incomes: INCOMES,
      accounts: ACCOUNTS,
      query: "",
      filters: createEmptyAccountActivityFilters(),
      monthKey: "2026-10",
    });
    expect(feed.totals).toEqual(journal.totals);
    expect(feed.totals.spent).toBe(1530);
    expect(feed.totals.income).toBe(50000);
    expect(feed.transferred).toBe(5040);
  });

  it("narrows by tab", () => {
    expect(buildTransactionsFeed({ ...base, tab: "expenses" }).rows.every((r) => r.kind === "expense")).toBe(true);
    expect(buildTransactionsFeed({ ...base, tab: "income" }).rows.map((r) => r.kind)).toEqual(["income"]);
    const transfers = buildTransactionsFeed({ ...base, tab: "transfers" });
    expect(transfers.rows.map((r) => r.kind)).toEqual(["transfer", "transfer"]);
    expect(transfers.totals.spent).toBe(0);
  });

  it("applies search and filters to transfers the same way", () => {
    // "bill" matches the transfer's note and the Bills expense alike.
    expect(buildTransactionsFeed({ ...base, query: "bill" }).rows.map((r) => r.record.activity.id).sort()).toEqual(["e2", "t1"]);
    expect(buildTransactionsFeed({ ...base, query: "card bill" }).rows.map((r) => r.record.activity.id)).toContain("t1");
    const byCategory = buildTransactionsFeed({ ...base, filters: { ...createEmptyAccountActivityFilters(), categories: ["Food"] } });
    expect(byCategory.rows.every((r) => r.kind === "expense")).toBe(true);
    const byAccount = buildTransactionsFeed({ ...base, filters: { ...createEmptyAccountActivityFilters(), accounts: ["Axis Card"] } });
    expect(byAccount.rows.map((r) => r.record.activity.id)).toEqual(["e2"]);
    const byAmount = buildTransactionsFeed({ ...base, filters: { ...createEmptyAccountActivityFilters(), minAmount: "1000" } });
    expect(byAmount.rows.map((r) => r.record.activity.id).sort()).toEqual(["e2", "i1", "t1"]);
  });

  it("lets a custom date range override the month, for transfers too", () => {
    const feed = buildTransactionsFeed({
      ...base,
      filters: { ...createEmptyAccountActivityFilters(), fromDate: "2026-09-01", toDate: "2026-09-30" },
    });
    expect(feed.rows.map((r) => r.record.activity.id).sort()).toEqual(["e-sep", "t-sep"]);
  });

  it("names a deleted account instead of dropping the transfer", () => {
    const [gone] = transferRecords([TRANSFERS[2]], ACCOUNTS);
    expect(gone.toName).toBe("Deleted account");
    expect(gone.counterparty).toBe("Deleted account");
  });
});

describe("sorting and grouping", () => {
  const rows = buildTransactionsFeed(base).rows;

  it("sorts by time or amount, newest first on ties", () => {
    expect(rows.map((r) => r.record.activity.id).slice(0, 2)).toEqual(["e1", "e3"]);
    expect(sortFeedRows(rows, "oldest")[0].record.activity.id).toBe("i1");
    expect(sortFeedRows(rows, "highest")[0].record.activity.id).toBe("i1");
    expect(sortFeedRows(rows, "lowest")[0].record.activity.id).toBe("t-gone");
  });

  it("groups by day with the Journal's own day totals, transfers left out", () => {
    const days = groupFeedByDay(rows);
    expect(days.map((d) => d.date)).toEqual(["2026-10-22", "2026-10-21", "2026-10-03", "2026-10-01"]);
    const oct21 = days[1];
    expect(oct21.rows.map((r) => r.kind).sort()).toEqual(["expense", "transfer"]);
    expect(oct21.totals.spent).toBe(1200);
    expect(oct21.totals.net).toBe(-1200);
    expect(days[2].totals.transactionCount).toBe(0);
  });
});

describe("navigation", () => {
  it("opens rows on the existing transaction detail route with their account", () => {
    const rows = buildTransactionsFeed(base).rows;
    const e1 = rows.find((r) => r.record.activity.id === "e1")!;
    expect(feedRowHref(e1)).toBe("/transactions/e1?kind=expense&accountId=hdfc");
    const t1 = rows.find((r) => r.record.activity.id === "t1")!;
    expect(feedRowHref(t1)).toBe("/transactions/t1?kind=transfer&accountId=hdfc");
  });

  it("links See all with the month and a non-default tab", () => {
    expect(transactionsHref("2026-10")).toBe("/transactions?month=2026-10");
    expect(transactionsHref("2026-10", "transfers")).toBe("/transactions?month=2026-10&tab=transfers");
  });
});

describe("scope helpers", () => {
  it("lists the months a range covers, newest first, capped at a year", () => {
    expect(monthsInScope({ fromDate: "", toDate: "", monthKey: "2026-10" })).toEqual({ months: ["2026-10"], truncated: false });
    expect(monthsInScope({ fromDate: "2025-12-15", toDate: "2026-02-03", monthKey: "2026-10" })).toEqual({
      months: ["2026-02", "2026-01", "2025-12"],
      truncated: false,
    });
    const long = monthsInScope({ fromDate: "2024-01-01", toDate: "2026-10-31", monthKey: "2026-10" });
    expect(long.months).toHaveLength(12);
    expect(long.truncated).toBe(true);
  });

  it("labels today and yesterday, across a month boundary", () => {
    expect(relativeDayLabel("2026-10-23", "2026-10-23")).toBe("Today");
    expect(relativeDayLabel("2026-09-30", "2026-10-01")).toBe("Yesterday");
    expect(relativeDayLabel("2026-10-20", "2026-10-23")).toBeNull();
  });
});
