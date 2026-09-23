import { daysInMonth, monthFromDateKey } from "./dates";
import { roundMoney } from "./money";
import type { FilterableAccountActivity } from "./accountActivityFilters";

/**
 * A month of account activity, derived entirely from the normalized
 * `buildAccountActivities()` rows — no parallel ledger and no re-reading.
 *
 * Transfers are kept out of `income` and `expenses` so a month is never
 * double-counted: moving money between your own accounts, settling a card
 * bill, borrowing, lending and collecting are all money movement, not
 * earning or spending.
 */
export interface AccountMonthSummary {
  month: string;
  activityCount: number;
  income: number;
  expenses: number;
  transfersIn: number;
  transfersOut: number;
  /** Credits minus debits across every row in the month. */
  netChange: number;
  /**
   * Balance carried into and out of the month. Undefined when it cannot be
   * stated honestly: credit cards (a liability, not a balance) and months
   * with rows from before the account's balance baseline.
   */
  openingBalance?: number;
  closingBalance?: number;
}

export interface AccountMonthSummaryOptions {
  /**
   * False for credit cards. `buildAccountActivities()` only assigns
   * `runningBalance` to non-credit accounts, and a card's outstanding is a
   * liability that must not be presented as a bank balance.
   */
  supportsRunningBalance?: boolean;
}

function monthOf(record: FilterableAccountActivity): string {
  return monthFromDateKey(record.activity.date);
}

/** Every month that has at least one activity, newest first. */
export function listAccountActivityMonths(
  records: FilterableAccountActivity[]
): string[] {
  const months = [...new Set(records.map(monthOf))].filter(Boolean);
  return months.sort((a, b) => b.localeCompare(a));
}

/**
 * The rows belonging to one month, in the order they were given (the screen
 * hands them over newest-first, and that order is preserved).
 */
export function selectAccountMonthActivities(
  records: FilterableAccountActivity[],
  month: string
): FilterableAccountActivity[] {
  return records.filter((record) => monthOf(record) === month);
}

/** Inclusive `YYYY-MM-DD` bounds for a month, for reuse as a date filter. */
export function accountMonthDateRange(month: string): {
  fromDate: string;
  toDate: string;
} {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = daysInMonth(year, monthNumber - 1);
  return {
    fromDate: `${month}-01`,
    toDate: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

/**
 * Balance at the end of the newest month that precedes `month`, used as the
 * opening balance when the month itself has no activity.
 *
 * Relies on the records being newest-first, which is how
 * `buildAccountActivities()` returns them.
 */
function balanceBefore(
  records: FilterableAccountActivity[],
  month: string
): number | undefined {
  const previous = records.find((record) => monthOf(record) < month);
  return previous?.activity.runningBalance;
}

export function summarizeAccountMonth(
  records: FilterableAccountActivity[],
  month: string,
  options: AccountMonthSummaryOptions = {}
): AccountMonthSummary {
  const { supportsRunningBalance = true } = options;
  const inMonth = selectAccountMonthActivities(records, month);

  let income = 0;
  let expenses = 0;
  let transfersIn = 0;
  let transfersOut = 0;
  let credits = 0;
  let debits = 0;

  for (const record of inMonth) {
    const { amount, type } = record.activity;
    if (type === "credit") credits += amount;
    else debits += amount;

    if (record.kind === "income") income += amount;
    else if (record.kind === "expense") expenses += amount;
    else if (record.kind === "transfers") {
      if (type === "credit") transfersIn += amount;
      else transfersOut += amount;
    }
  }

  const netChange = roundMoney(credits - debits);

  const summary: AccountMonthSummary = {
    month,
    activityCount: inMonth.length,
    income: roundMoney(income),
    expenses: roundMoney(expenses),
    transfersIn: roundMoney(transfersIn),
    transfersOut: roundMoney(transfersOut),
    netChange,
  };

  if (!supportsRunningBalance) return summary;

  if (inMonth.length === 0) {
    // A quiet month neither opens nor closes on a different balance.
    const carried = balanceBefore(records, month);
    summary.openingBalance = carried;
    summary.closingBalance = carried;
    return summary;
  }

  // Every row must have contributed to the running balance, otherwise
  // `closing - netChange` would silently disagree with the ledger. Rows before
  // the account's balance baseline deliberately carry no running balance, so
  // such a month reports no opening/closing rather than a wrong one.
  const allCounted = inMonth.every(
    (record) => record.activity.runningBalance !== undefined
  );
  if (!allCounted) return summary;

  const closing = inMonth[0].activity.runningBalance;
  if (closing === undefined) return summary;

  summary.closingBalance = closing;
  summary.openingBalance = roundMoney(closing - netChange);
  return summary;
}
