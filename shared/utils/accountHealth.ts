import { currentMonthKey, monthFromDateKey, shiftMonthKey } from "./dates";
import { roundMoney } from "./money";
import type { FilterableAccountActivity } from "./accountActivityFilters";
import { summarizeAccountMonth } from "./accountMonthSummary";

/** Selectable history windows, in months. */
export const ACCOUNT_HISTORY_WINDOWS = [3, 6, 12] as const;
export type AccountHistoryWindow = (typeof ACCOUNT_HISTORY_WINDOWS)[number];

export const DEFAULT_ACCOUNT_HISTORY_WINDOW: AccountHistoryWindow = 6;

export interface AccountBalanceExtreme {
  amount: number;
  date: string;
}

export interface AccountHealthMetrics {
  window: AccountHistoryWindow;
  /** Months covered by the window, newest first. */
  months: string[];
  monthsWithActivity: number;
  transactionCount: number;
  /**
   * Ordinary earning and spending only. Transfers, bill payments, borrowings,
   * repayments, lending and collections are money movement and are excluded,
   * so these never double-count what the transfer counterpart already shows.
   */
  incomeTotal: number;
  expenseTotal: number;
  transfersIn: number;
  transfersOut: number;
  /**
   * Averaged over the months the account has actually existed within the
   * window, not the full window, so a two-month-old account is not reported
   * as spending a third of what it really does.
   */
  averageMonthlyIncome?: number;
  averageMonthlySpend?: number;
  /** Mean of the month-end balances that could be determined. */
  averageMonthlyBalance?: number;
  highestBalance?: AccountBalanceExtreme;
  lowestBalance?: AccountBalanceExtreme;
  lastActivityDate?: string;
}

export interface AccountHealthOptions {
  /**
   * False for credit cards: `buildAccountActivities()` assigns no running
   * balance to them, and an outstanding liability must never be averaged or
   * charted as a bank balance.
   */
  supportsRunningBalance?: boolean;
  /** Newest month of the window. Defaults to the current calendar month. */
  anchorMonth?: string;
}

/** The window's months, newest first. */
export function accountHistoryWindowMonths(
  window: AccountHistoryWindow,
  anchorMonth: string = currentMonthKey()
): string[] {
  return Array.from({ length: window }, (_, index) =>
    shiftMonthKey(anchorMonth, -index)
  );
}

function averageOf(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return roundMoney(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function computeAccountHealthMetrics(
  records: FilterableAccountActivity[],
  window: AccountHistoryWindow,
  options: AccountHealthOptions = {}
): AccountHealthMetrics {
  const { supportsRunningBalance = true, anchorMonth = currentMonthKey() } =
    options;
  const months = accountHistoryWindowMonths(window, anchorMonth);
  const oldestMonth = months[months.length - 1];
  const newestMonth = months[0];

  const inWindow = records.filter((record) => {
    const month = monthFromDateKey(record.activity.date);
    return month >= oldestMonth && month <= newestMonth;
  });

  const summaries = months.map((month) =>
    summarizeAccountMonth(records, month, { supportsRunningBalance })
  );

  const incomeTotal = roundMoney(
    summaries.reduce((sum, summary) => sum + summary.income, 0)
  );
  const expenseTotal = roundMoney(
    summaries.reduce((sum, summary) => sum + summary.expenses, 0)
  );
  const transfersIn = roundMoney(
    summaries.reduce((sum, summary) => sum + summary.transfersIn, 0)
  );
  const transfersOut = roundMoney(
    summaries.reduce((sum, summary) => sum + summary.transfersOut, 0)
  );

  const metrics: AccountHealthMetrics = {
    window,
    months,
    monthsWithActivity: summaries.filter((summary) => summary.activityCount > 0)
      .length,
    transactionCount: inWindow.length,
    incomeTotal,
    expenseTotal,
    transfersIn,
    transfersOut,
    lastActivityDate: inWindow[0]?.activity.date,
  };

  // Average over the months the account has existed within the window. The
  // account's first activity anywhere in its history marks that start, so a
  // dormant older account still averages across the whole window.
  const firstMonthEver = records.length
    ? monthFromDateKey(records[records.length - 1].activity.date)
    : undefined;
  const elapsedMonths =
    firstMonthEver === undefined
      ? 0
      : months.filter((month) => month >= firstMonthEver).length;

  if (elapsedMonths > 0) {
    metrics.averageMonthlyIncome = roundMoney(incomeTotal / elapsedMonths);
    metrics.averageMonthlySpend = roundMoney(expenseTotal / elapsedMonths);
  }

  if (!supportsRunningBalance) return metrics;

  const monthEndBalances = summaries
    .map((summary) => summary.closingBalance)
    .filter((balance): balance is number => balance !== undefined);
  metrics.averageMonthlyBalance = averageOf(monthEndBalances);

  for (const record of inWindow) {
    const { runningBalance, date } = record.activity;
    if (runningBalance === undefined) continue;
    if (!metrics.highestBalance || runningBalance > metrics.highestBalance.amount) {
      metrics.highestBalance = { amount: runningBalance, date };
    }
    if (!metrics.lowestBalance || runningBalance < metrics.lowestBalance.amount) {
      metrics.lowestBalance = { amount: runningBalance, date };
    }
  }

  return metrics;
}
