import { monthFromDateKey, shiftMonthKey, currentMonthKey } from "./dates";
import { roundMoney } from "./money";
import { activityTitle } from "./activityDisplay";
import type { FilterableAccountActivity } from "./accountActivityFilters";
import {
  accountHistoryWindowMonths,
  type AccountHistoryWindow,
} from "./accountHealth";

/** Label for spending with no category, matching the rest of the app. */
export const UNCATEGORIZED = "Uncategorized";

const TOP_COUNTERPARTY_LIMIT = 5;

export interface CategorySpend {
  category: string;
  amount: number;
  count: number;
  /** Fraction of the period's total spend, 0 when there is no spend. */
  share: number;
}

export interface NamedTotal {
  name: string;
  amount: number;
  count: number;
}

export interface LargestExpense {
  id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
}

export interface PeriodComparison {
  current: number;
  previous: number;
  delta: number;
  /**
   * Change as a fraction of the previous period. Undefined when the previous
   * period was zero — there is no meaningful percentage against nothing.
   */
  changeRatio?: number;
}

export interface AccountSpendingInsights {
  window: AccountHistoryWindow;
  months: string[];
  previousMonths: string[];
  totalSpend: number;
  totalIncome: number;
  /** Refunds and cashback, reported on their own rather than as income. */
  refundsTotal: number;
  categories: CategorySpend[];
  largestCategory?: CategorySpend;
  largestExpense?: LargestExpense;
  incomeSources: NamedTotal[];
  topCounterparties: NamedTotal[];
  spendComparison: PeriodComparison;
  incomeComparison: PeriodComparison;
}

export interface AccountSpendingInsightsOptions {
  anchorMonth?: string;
}

/**
 * Real outflow only. Transfers, bill payments, borrowings, repayments,
 * lending and collections are money movement, and the SPENDLY-82
 * classification already separates them, so they can never reach these totals.
 */
function isSpending(record: FilterableAccountActivity): boolean {
  return record.kind === "expense" && record.activity.type === "debit";
}

/**
 * Ordinary earning only. A refund or a card cashback arrives as a credit but
 * is money coming back, not money earned — counting it as income would
 * overstate what the account actually brings in.
 */
function isIncome(record: FilterableAccountActivity): boolean {
  return (
    record.kind === "income" &&
    record.activity.type === "credit" &&
    !record.isRefund
  );
}

function isRefund(record: FilterableAccountActivity): boolean {
  return record.isRefund && record.activity.type === "credit";
}

function inMonths(
  records: FilterableAccountActivity[],
  months: string[]
): FilterableAccountActivity[] {
  const oldest = months[months.length - 1];
  const newest = months[0];
  return records.filter((record) => {
    const month = monthFromDateKey(record.activity.date);
    return month >= oldest && month <= newest;
  });
}

function sumOf(
  records: FilterableAccountActivity[],
  predicate: (record: FilterableAccountActivity) => boolean
): number {
  return roundMoney(
    records.reduce(
      (sum, record) => (predicate(record) ? sum + record.activity.amount : sum),
      0
    )
  );
}

function tally(
  records: FilterableAccountActivity[],
  nameOf: (record: FilterableAccountActivity) => string | undefined
): NamedTotal[] {
  const totals = new Map<string, NamedTotal>();
  for (const record of records) {
    const name = nameOf(record);
    if (!name) continue;
    const existing = totals.get(name);
    if (existing) {
      existing.amount += record.activity.amount;
      existing.count += 1;
    } else {
      totals.set(name, { name, amount: record.activity.amount, count: 1 });
    }
  }
  return [...totals.values()]
    .map((total) => ({ ...total, amount: roundMoney(total.amount) }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

function compare(current: number, previous: number): PeriodComparison {
  return {
    current,
    previous,
    delta: roundMoney(current - previous),
    changeRatio:
      previous === 0 ? undefined : roundMoney((current - previous) / previous),
  };
}

export function computeAccountSpendingInsights(
  records: FilterableAccountActivity[],
  window: AccountHistoryWindow,
  options: AccountSpendingInsightsOptions = {}
): AccountSpendingInsights {
  const { anchorMonth = currentMonthKey() } = options;
  const months = accountHistoryWindowMonths(window, anchorMonth);
  // The period immediately before, of the same length, so the comparison is
  // like for like.
  const previousMonths = accountHistoryWindowMonths(
    window,
    shiftMonthKey(months[months.length - 1], -1)
  );

  const current = inMonths(records, months);
  const previous = inMonths(records, previousMonths);

  const totalSpend = sumOf(current, isSpending);
  const totalIncome = sumOf(current, isIncome);
  const refundsTotal = sumOf(current, isRefund);

  const spendingRecords = current.filter(isSpending);

  const categories: CategorySpend[] = tally(spendingRecords, (record) =>
    record.category?.trim() ? record.category : UNCATEGORIZED
  ).map((total) => ({
    category: total.name,
    amount: total.amount,
    count: total.count,
    share: totalSpend === 0 ? 0 : total.amount / totalSpend,
  }));

  let largestExpense: LargestExpense | undefined;
  for (const record of spendingRecords) {
    if (largestExpense && record.activity.amount <= largestExpense.amount) {
      continue;
    }
    largestExpense = {
      id: record.activity.id,
      title: activityTitle(record.activity),
      category: record.category?.trim() ? record.category : UNCATEGORIZED,
      amount: record.activity.amount,
      date: record.activity.date,
    };
  }

  return {
    window,
    months,
    previousMonths,
    totalSpend,
    totalIncome,
    refundsTotal,
    categories,
    largestCategory: categories[0],
    largestExpense,
    incomeSources: tally(current.filter(isIncome), (record) =>
      record.activity.source?.trim()
    ),
    topCounterparties: tally(spendingRecords, (record) =>
      record.counterparty
    ).slice(0, TOP_COUNTERPARTY_LIMIT),
    spendComparison: compare(totalSpend, sumOf(previous, isSpending)),
    incomeComparison: compare(totalIncome, sumOf(previous, isIncome)),
  };
}
