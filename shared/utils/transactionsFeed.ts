import type { AccountTransfer, AccountType, Expense, Income } from "@/shared/types/expense";
import { getAccountDisplayName } from "@/shared/utils/accountIdentity";
import { postingSortMs } from "@/shared/utils/activityDisplay";
import { shiftMonthKey } from "@/shared/utils/dates";
import {
  applyAccountActivityFilters,
  type AccountActivityFilters,
  type FilterableAccountActivity,
} from "@/shared/utils/accountActivityFilters";
import { searchAccountActivities } from "@/shared/utils/accountActivitySearch";
import type { JournalAccount, JournalRecord } from "@/shared/utils/journalActivities";
import { runJournalFilterPipeline } from "@/shared/utils/journalFilterPipeline";
import { summarizeJournalTotals, type JournalTotals } from "@/shared/utils/journalPeriodSummary";
import { transactionHref, type TransactionRef } from "@/shared/utils/transactionRef";

/**
 * SPENDLY-576 — the dashboard's "See all" Transactions list. It is a thin
 * layer over the Journal's own pipeline (`runJournalFilterPipeline`: the same
 * records, search, filters, month-or-range scope and totals the Money tab
 * uses) plus the account transfers the app already loads, put through the
 * same search and filter functions.
 *
 * Transfers move money between the user's own accounts. They are listed, but
 * never added to spent, income or a day's total — exactly as the Journal and
 * the dashboard summaries leave them out. Pure, no React Native.
 */

export const TRANSACTIONS_TABS = ["all", "expenses", "income", "transfers"] as const;
export type TransactionsTab = (typeof TRANSACTIONS_TABS)[number];

export const TRANSACTIONS_SORTS = ["newest", "oldest", "highest", "lowest"] as const;
export type TransactionsSort = (typeof TRANSACTIONS_SORTS)[number];

export const TRANSACTIONS_SORT_LABELS: Record<TransactionsSort, string> = {
  newest: "Latest first",
  oldest: "Oldest first",
  highest: "Highest amount",
  lowest: "Lowest amount",
};

/** A transfer as a filterable row; `transfer` keeps the source record. */
export type TransferRecord = FilterableAccountActivity & { transfer: AccountTransfer; fromName: string; toName: string };

export type FeedRow =
  | { kind: "expense" | "income"; record: JournalRecord }
  | { kind: "transfer"; record: TransferRecord };

function nameFor(accounts: readonly JournalAccount[], id: string): string {
  const account = accounts.find((a) => a.id === id);
  return (account && getAccountDisplayName(account)) || "Deleted account";
}

/**
 * Transfers as Journal-shaped rows. The posting account is the source, the
 * counterparty the destination, so the account and counterparty filters and
 * search treat them like any other movement. No category: a category filter
 * leaves them out, which is right — a transfer is not spending.
 */
export function transferRecords(
  transfers: readonly AccountTransfer[],
  accounts: readonly JournalAccount[]
): TransferRecord[] {
  return transfers
    .filter((t) => t.id && Number.isFinite(t.amount) && t.amount > 0 && t.date)
    .map((transfer) => {
      const fromName = nameFor(accounts, transfer.fromAccountId);
      const toName = nameFor(accounts, transfer.toAccountId);
      return {
        transfer,
        fromName,
        toName,
        kind: "transfers" as const,
        activity: {
          id: transfer.id,
          date: transfer.date,
          amount: transfer.amount,
          type: "debit" as const,
          note: transfer.note,
          linkedTransferId: transfer.id,
          isTransfer: true,
        },
        accountName: fromName,
        counterparty: toName,
        tags: [],
        isRefund: false,
        isInvestment: false,
        isBill: false,
        searchText: [transfer.note, fromName, toName, "transfer", transfer.date].filter(Boolean).join(" ").toLowerCase(),
      };
    });
}

export type TransactionsFeedInput = {
  expenses: Expense[];
  incomes: Income[];
  transfers: readonly AccountTransfer[];
  accounts: JournalAccount[];
  accountTypes?: Pick<AccountType, "id" | "name">[];
  query: string;
  filters: AccountActivityFilters;
  monthKey: string;
  tab: TransactionsTab;
  sort: TransactionsSort;
};

export type TransactionsFeed = {
  rows: FeedRow[];
  /** Rows per tab after search and filters (each ignores the tab itself). */
  counts: Record<TransactionsTab, number>;
  /** The Journal's totals over the rows in view; transfers excluded. */
  totals: JournalTotals;
  /** Sum of the transfers in view, shown on its own. */
  transferred: number;
  filterOptions: ReturnType<typeof runJournalFilterPipeline>["filterOptions"];
  activeFilterCount: number;
  validationError: string | null;
  /** The resolved month or custom range. */
  dateScope: ReturnType<typeof runJournalFilterPipeline>["dateScope"];
};

/**
 * When a row was posted, as the Journal's `ExpenseList` orders it: the date,
 * the stored clock time when there is one, else when it was created.
 */
function rowPostedMs(row: FeedRow): number {
  if (row.kind === "transfer") {
    return postingSortMs(row.record.transfer.date, undefined, row.record.transfer.createdAt);
  }
  const source = row.record.expense ?? row.record.income;
  return postingSortMs(row.record.activity.date, source?.time, source?.createdAt);
}

/** Sort rows; ties fall back to newest first, then id, so the order is stable. */
export function sortFeedRows(rows: FeedRow[], sort: TransactionsSort): FeedRow[] {
  const byTimeDesc = (a: FeedRow, b: FeedRow) =>
    rowPostedMs(b) - rowPostedMs(a) || b.record.activity.id.localeCompare(a.record.activity.id);
  const out = [...rows];
  if (sort === "oldest") out.sort((a, b) => -byTimeDesc(a, b));
  else if (sort === "highest") out.sort((a, b) => b.record.activity.amount - a.record.activity.amount || byTimeDesc(a, b));
  else if (sort === "lowest") out.sort((a, b) => a.record.activity.amount - b.record.activity.amount || byTimeDesc(a, b));
  else out.sort(byTimeDesc);
  return out;
}

export function buildTransactionsFeed(input: TransactionsFeedInput): TransactionsFeed {
  const journal = runJournalFilterPipeline({
    expenses: input.expenses,
    incomes: input.incomes,
    accounts: input.accounts,
    accountTypes: input.accountTypes,
    query: input.query,
    filters: { ...input.filters, kind: input.tab === "expenses" ? "expense" : input.tab === "income" ? "income" : "all" },
    monthKey: input.monthKey,
    granularity: "day",
  });

  // Same search, then the same resolved month-or-range and user filters.
  const transfers = applyAccountActivityFilters(
    searchAccountActivities(transferRecords(input.transfers, input.accounts), input.query),
    { ...journal.effectiveFilters, kind: "all" }
  );

  const journalRows: FeedRow[] = journal.filtered.map((record) => ({
    kind: record.kind === "income" ? "income" : "expense",
    record,
  }));
  const transferRows: FeedRow[] = transfers.map((record) => ({ kind: "transfer", record }));

  const rows =
    input.tab === "transfers"
      ? transferRows
      : input.tab === "all"
        ? [...journalRows, ...transferRows]
        : journalRows;

  return {
    rows: sortFeedRows(rows, input.sort),
    counts: {
      all: journal.kindCounts.income + journal.kindCounts.expense + transfers.length,
      expenses: journal.kindCounts.expense,
      income: journal.kindCounts.income,
      transfers: transfers.length,
    },
    totals: input.tab === "transfers" ? summarizeJournalTotals([]) : journal.totals,
    transferred: Math.round(transfers.reduce((sum, t) => sum + t.activity.amount, 0) * 100) / 100,
    filterOptions: journal.filterOptions,
    activeFilterCount: journal.activeFilterCount,
    validationError: journal.validationError,
    dateScope: journal.dateScope,
  };
}

export type FeedDay = {
  date: string;
  rows: FeedRow[];
  /** The Journal's totals for the day's expense and income rows; transfers excluded. */
  totals: JournalTotals;
};

/** Rows grouped by day (already sorted by date), each with the Journal's own totals. */
export function groupFeedByDay(rows: readonly FeedRow[]): FeedDay[] {
  const days: FeedDay[] = [];
  for (const row of rows) {
    const date = row.record.activity.date;
    let day = days[days.length - 1];
    if (!day || day.date !== date) {
      day = { date, rows: [], totals: summarizeJournalTotals([]) };
      days.push(day);
    }
    day.rows.push(row);
  }
  for (const day of days) {
    day.totals = summarizeJournalTotals(
      day.rows.filter((r): r is Extract<FeedRow, { kind: "expense" | "income" }> => r.kind !== "transfer").map((r) => r.record)
    );
  }
  return days;
}

/** Where a row opens: the existing transaction detail route. */
export function feedRowRef(row: FeedRow): TransactionRef {
  if (row.kind === "transfer") return { kind: "transfer", id: row.record.transfer.id };
  const id = row.kind === "income" ? row.record.income?.id : row.record.expense?.id;
  return { kind: row.kind, id: id ?? row.record.activity.id };
}

export function feedRowHref(row: FeedRow): string {
  const accountId =
    row.kind === "transfer" ? row.record.transfer.fromAccountId : (row.record.expense?.accountId ?? row.record.income?.accountId);
  return transactionHref(feedRowRef(row), accountId);
}

export function transactionsHref(month: string, tab?: TransactionsTab): string {
  const query = [`month=${encodeURIComponent(month)}`];
  if (tab && tab !== "all") query.push(`tab=${tab}`);
  return `/transactions?${query.join("&")}`;
}

/** At most this many months are fetched for a custom range; older ones say so. */
export const MAX_RANGE_MONTHS = 12;

/**
 * The month keys a date scope covers, newest first, capped. The list asks the
 * store for each (one bounded read per month, skipped when loaded) so a range
 * never silently shows only the first page of rows.
 */
export function monthsInScope(scope: { fromDate: string; toDate: string; monthKey: string }): {
  months: string[];
  truncated: boolean;
} {
  if (!scope.fromDate || !scope.toDate) return { months: [scope.monthKey], truncated: false };
  const first = scope.fromDate.slice(0, 7);
  const months: string[] = [];
  let cursor = scope.toDate.slice(0, 7);
  while (cursor >= first && months.length < MAX_RANGE_MONTHS) {
    months.push(cursor);
    cursor = shiftMonthKey(cursor, -1);
  }
  return { months, truncated: cursor >= first };
}

/** "Today" / "Yesterday" for the day headers, else null (the caller formats the date). */
export function relativeDayLabel(date: string, todayKey: string): "Today" | "Yesterday" | null {
  if (date === todayKey) return "Today";
  const yesterday = new Date(`${todayKey}T00:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const key = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  return date === key ? "Yesterday" : null;
}
