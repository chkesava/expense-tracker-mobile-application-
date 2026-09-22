import { currentMonthKey, daysBetweenDateKeys, monthFromDateKey } from "./dates";
import type { AccountActivity } from "@/shared/types/expense";
import type { FilterableAccountActivity } from "./accountActivityFilters";
import {
  accountHistoryWindowMonths,
  type AccountHistoryWindow,
} from "./accountHealth";

export interface AccountActivityStats {
  window: AccountHistoryWindow;
  /** Months covered by the window, newest first. */
  months: string[];
  /** Every row in the period. Legs, not movements — see `transferCount`. */
  totalTransactions: number;
  /** Ordinary earning. Refunds and cashback are counted as refunds instead. */
  incomeCount: number;
  expenseCount: number;
  /**
   * Distinct money movements, not rows. Where both legs of the same transfer
   * land in this account they are one movement, counted once.
   */
  transferCount: number;
  /** Transfer rows before de-duplication. Equals `transferCount` normally. */
  transferLegCount: number;
  /** Refunds and cashback, wherever they were classified. */
  refundCount: number;
  /** Rows the classification could not place as income, expense or transfer. */
  otherCount: number;
  firstActivityDate?: string;
  lastActivityDate?: string;
  /** Distinct calendar days carrying at least one row. */
  activeDays: number;
  /** Days from first to last activity inclusive. Undefined with no activity. */
  spanDays?: number;
  /** Undefined when nothing happened — there is no rate over no days. */
  averageTransactionsPerActiveDay?: number;
}

export interface AccountActivityStatsOptions {
  /** Newest month of the window. Defaults to the current calendar month. */
  anchorMonth?: string;
}

/**
 * Identifies the underlying money movement a transfer-like row belongs to.
 *
 * A transfer between two accounts writes one row into each, so within a single
 * account's ledger each movement normally appears once. It appears twice when
 * both ends are the same account: `buildAccountActivities()` collects the
 * outgoing and incoming legs separately, and a transfer whose source and
 * destination match is picked up by both. Counting rows there would report two
 * transfers where the user made one, so rows sharing a movement id collapse.
 *
 * Rows carrying no movement id — a manual entry paired only through its
 * account entry — fall back to their own row id and so always count once,
 * which is correct: those are written one per account.
 */
function movementId(activity: AccountActivity): string {
  return (
    activity.linkedTransferId ??
    activity.linkedPaymentId ??
    activity.linkedBorrowingId ??
    activity.linkedRepaymentId ??
    activity.linkedReceivableId ??
    activity.linkedReceivableRepaymentId ??
    activity.id
  );
}

/**
 * A refund or a card cashback is money coming back, not money earned. It is
 * reported on its own here for the same reason SPENDLY-85 keeps it out of
 * income, so the income count describes what the account actually earns.
 */
function isRefund(record: FilterableAccountActivity): boolean {
  return record.isRefund;
}

export function computeAccountActivityStats(
  records: FilterableAccountActivity[],
  window: AccountHistoryWindow,
  options: AccountActivityStatsOptions = {}
): AccountActivityStats {
  const { anchorMonth = currentMonthKey() } = options;
  const months = accountHistoryWindowMonths(window, anchorMonth);
  const oldestMonth = months[months.length - 1];
  const newestMonth = months[0];

  const inWindow = records.filter((record) => {
    const month = monthFromDateKey(record.activity.date);
    return month >= oldestMonth && month <= newestMonth;
  });

  const stats: AccountActivityStats = {
    window,
    months,
    totalTransactions: inWindow.length,
    incomeCount: 0,
    expenseCount: 0,
    transferCount: 0,
    transferLegCount: 0,
    refundCount: 0,
    otherCount: 0,
    activeDays: 0,
  };

  const transferMovements = new Set<string>();
  const days = new Set<string>();
  let firstActivityDate: string | undefined;
  let lastActivityDate: string | undefined;

  for (const record of inWindow) {
    const { date } = record.activity;
    days.add(date);
    if (firstActivityDate === undefined || date < firstActivityDate) {
      firstActivityDate = date;
    }
    if (lastActivityDate === undefined || date > lastActivityDate) {
      lastActivityDate = date;
    }

    // Refunds are counted as refunds and nowhere else, so a refund credited
    // against an income row cannot inflate the income count as well.
    if (isRefund(record)) {
      stats.refundCount += 1;
      continue;
    }

    if (record.kind === "income") {
      stats.incomeCount += 1;
    } else if (record.kind === "expense") {
      stats.expenseCount += 1;
    } else if (record.kind === "transfers") {
      stats.transferLegCount += 1;
      transferMovements.add(movementId(record.activity));
    } else {
      stats.otherCount += 1;
    }
  }

  stats.transferCount = transferMovements.size;
  stats.activeDays = days.size;
  stats.firstActivityDate = firstActivityDate;
  stats.lastActivityDate = lastActivityDate;

  if (firstActivityDate && lastActivityDate) {
    stats.spanDays = daysBetweenDateKeys(firstActivityDate, lastActivityDate) + 1;
  }

  if (days.size > 0) {
    stats.averageTransactionsPerActiveDay =
      Math.round((inWindow.length / days.size) * 10) / 10;
  }

  return stats;
}
