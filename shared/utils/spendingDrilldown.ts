import type { Expense } from "@/shared/types/expense";
import type { DashboardPeriodSummary } from "@/shared/types/financialSummary";
import { summaryMonthOf } from "@/shared/utils/dashboardSummaryKeys";
import { topCategoryShares } from "@/shared/utils/dashboardWidgets";
import { shiftMonthKey } from "@/shared/utils/dates";

/**
 * SPENDLY-574 — the Spending Overview drill-downs (Total Spending and one
 * category's details). Everything here reads the same two sources the
 * dashboard already does and applies the same rules, so a figure on a detail
 * page always reconciles with the donut for the same month:
 *
 * - headline totals, shares and month trends come from the materialized
 *   `dashboard_{YYYY-MM}` summaries' `categoryTotals` (parent keys partition
 *   the month, `"Parent::Sub"` keys split a parent), with the denominator
 *   `topCategoryShares` uses;
 * - the transaction lists are ledger `expenses` rows filtered by the summary's
 *   own inclusion rule: not soft-deleted, bucketed by `summaryMonthOf`, and
 *   matched on the stored parent category name.
 *
 * Refunds are incomes and transfers are their own collection, so neither is
 * ever an expense row here, exactly as in the summary. Pure, no React Native.
 */

export const TOTAL_SPENDING_TABS = ["overview", "categories", "transactions", "trends"] as const;
export type TotalSpendingTab = (typeof TOTAL_SPENDING_TABS)[number];

export const CATEGORY_DETAIL_TABS = ["overview", "transactions", "budget", "insights"] as const;
export type CategoryDetailTab = (typeof CATEGORY_DETAIL_TABS)[number];

/** Filter value for rows that have no subcategory. */
export const NO_SUBCATEGORY = "__none__";

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && MONTH_KEY.test(value);
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** A valid `month` param, else the fallback (the dashboard's active month). */
export function resolveSpendingMonth(param: string | string[] | undefined, fallback: string): string {
  const month = firstParam(param);
  return isMonthKey(month) ? month : fallback;
}

export function resolveSpendingTab<T extends string>(
  param: string | string[] | undefined,
  tabs: readonly T[],
  fallback: T
): T {
  const tab = firstParam(param);
  return tabs.includes(tab as T) ? (tab as T) : fallback;
}

/**
 * The category route param back to the stored category key. Expense rows and
 * `categoryTotals` both key spend by the parent category name, so that name is
 * the stable identifier — URL-encoded so "Home & Household" or a name with a
 * slash survives the route.
 */
export function decodeCategoryParam(param: string | string[] | undefined): string | null {
  const raw = firstParam(param);
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw).trim();
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

export function totalSpendingHref(month: string, tab?: TotalSpendingTab): string {
  const query = [`month=${encodeURIComponent(month)}`];
  if (tab && tab !== "overview") query.push(`tab=${tab}`);
  return `/spending?${query.join("&")}`;
}

export function categoryDetailHref(category: string, month: string, tab?: CategoryDetailTab): string {
  const query = [`month=${encodeURIComponent(month)}`];
  if (tab && tab !== "overview") query.push(`tab=${tab}`);
  return `/spending/${encodeURIComponent(category)}?${query.join("&")}`;
}

/** The dashboard legend's folded "Others" slice is not a category of its own. */
export const OTHERS_SLICE = "Others";

/**
 * Where a Spending Overview legend row or slice leads. The folded "Others"
 * slice has no detail page, so it opens the ranked category list instead.
 */
export function spendingOverviewTargetHref(slice: string, month: string, isFoldedOthers: boolean): string {
  return isFoldedOthers ? totalSpendingHref(month, "categories") : categoryDetailHref(slice, month);
}

/**
 * Whether legend entry `index` of a `spendingBreakdown(totals, limit)` result
 * is the folded remainder rather than a real category that happens to be
 * called "Others".
 */
export function isFoldedOthersSlice(
  categories: readonly { category: string }[],
  index: number,
  categoryTotals: Record<string, number> | null | undefined,
  limit: number
): boolean {
  if (categories[index]?.category !== OTHERS_SLICE || index !== limit) return false;
  const parents = Object.keys(categoryTotals ?? {}).filter((k) => !k.includes("::") && (categoryTotals?.[k] ?? 0) > 0);
  return parents.length > limit + 1;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The donut's "Total spent": the sum of the month's parent-category totals. */
export function categorizedSpendTotal(categoryTotals: Record<string, number> | null | undefined): number {
  return topCategoryShares(categoryTotals, 0).totalSpent;
}

/**
 * Spend the summary counts in `totalExpenses` but under no category (a row with
 * an empty category name adds to the total and to no category key). Shown as a
 * note rather than silently dropped; zero when everything is categorized.
 */
export function uncategorizedSpend(summary: Pick<DashboardPeriodSummary, "totalExpenses" | "categoryTotals"> | null): number {
  if (!summary) return 0;
  const gap = round2((summary.totalExpenses || 0) - categorizedSpendTotal(summary.categoryTotals));
  return gap > 0.005 ? gap : 0;
}

export type SubcategoryShare = {
  /** The stored subcategory name, or `NO_SUBCATEGORY`. */
  key: string;
  label: string;
  amount: number;
  /** Share of the parent category's total, 0–100. */
  percentage: number;
};

export type CategorySpendSummary = {
  category: string;
  total: number;
  /** Share of the month's categorized spend (the donut's denominator), 0–100. */
  shareOfTotal: number;
  subcategories: SubcategoryShare[];
};

/**
 * One category's month from the summary: its total, its share of the donut
 * total, and its subcategory split from the `"Parent::Sub"` keys. Spend under
 * the parent with no subcategory is its own explicit row, so the split always
 * adds back up to the parent total.
 */
export function categorySpendSummary(
  categoryTotals: Record<string, number> | null | undefined,
  category: string
): CategorySpendSummary {
  const totals = categoryTotals ?? {};
  const total = Number.isFinite(totals[category]) ? Math.max(0, totals[category]) : 0;
  const denominator = categorizedSpendTotal(totals);
  const prefix = `${category}::`;

  const subs = Object.entries(totals)
    .filter(([key, amount]) => key.startsWith(prefix) && Number.isFinite(amount) && amount > 0)
    .map(([key, amount]) => ({ key: key.slice(prefix.length), label: key.slice(prefix.length), amount }));
  const subTotal = subs.reduce((sum, s) => sum + s.amount, 0);
  const remainder = round2(total - subTotal);
  if (remainder > 0.005) subs.push({ key: NO_SUBCATEGORY, label: "No subcategory", amount: remainder });

  return {
    category,
    total,
    shareOfTotal: denominator > 0 ? (total / denominator) * 100 : 0,
    subcategories: subs
      .sort((a, b) => b.amount - a.amount)
      .map((s) => ({ ...s, percentage: total > 0 ? (s.amount / total) * 100 : 0 })),
  };
}

export type SpendComparison = {
  previous: number;
  delta: number;
  /** Change against the previous amount, in percent. */
  pct: number;
  direction: "up" | "down" | "flat";
};

/**
 * A period-over-period change, or null when the previous period cannot carry a
 * comparison (no summary for it, or nothing spent): a percentage off a zero or
 * missing base would be invented, not measured.
 */
export function spendComparison(current: number, previous: number | null | undefined): SpendComparison | null {
  if (previous == null || !Number.isFinite(previous) || previous <= 0) return null;
  const delta = round2(current - previous);
  const pct = (delta / previous) * 100;
  const direction = Math.abs(delta) < 0.005 ? "flat" : delta > 0 ? "up" : "down";
  return { previous, delta, pct, direction };
}

export type MonthSpendPoint = {
  month: string;
  amount: number;
  /** False when no summary exists for the month — not the same as spending 0. */
  hasData: boolean;
};

/**
 * `count` months ending at `endMonth`, oldest first, from the summaries: the
 * month's donut total, or one category's total when `category` is given.
 */
export function monthlySpendSeries(
  summaries: readonly Pick<DashboardPeriodSummary, "period" | "categoryTotals">[],
  endMonth: string,
  count: number,
  category?: string
): MonthSpendPoint[] {
  const byMonth = new Map(summaries.map((s) => [s.period, s]));
  const points: MonthSpendPoint[] = [];
  for (let i = Math.max(1, count) - 1; i >= 0; i -= 1) {
    const month = shiftMonthKey(endMonth, -i);
    const summary = byMonth.get(month);
    const amount = !summary
      ? 0
      : category
        ? Math.max(0, summary.categoryTotals?.[category] ?? 0)
        : categorizedSpendTotal(summary.categoryTotals);
    points.push({ month, amount, hasData: Boolean(summary) });
  }
  return points;
}

/** The summary's inclusion rule for one ledger row in one month (and category). */
export function isEligibleExpense(expense: Expense, month: string, category?: string): boolean {
  if (expense.deletedAt) return false;
  if (!(Number.isFinite(expense.amount) && expense.amount > 0)) return false;
  if (summaryMonthOf(expense) !== month) return false;
  if (category === undefined) return Boolean(expense.category);
  return expense.category === category;
}

export function eligibleExpenses(expenses: readonly Expense[], month: string, category?: string): Expense[] {
  return expenses.filter((e) => isEligibleExpense(e, month, category));
}

export type TransactionStats = { count: number; total: number; average: number | null };

export function transactionStats(rows: readonly Pick<Expense, "amount">[]): TransactionStats {
  const total = round2(rows.reduce((sum, r) => sum + r.amount, 0));
  return { count: rows.length, total, average: rows.length > 0 ? round2(total / rows.length) : null };
}

/**
 * Whether the listed rows add up to the summary's figure. A gap means the
 * month's rows are not all loaded yet or the summary is waiting on a rebuild;
 * the screens say so instead of showing two numbers that disagree silently.
 */
export function ledgerReconciles(rowsTotal: number, summaryTotal: number): boolean {
  return Math.abs(round2(rowsTotal) - round2(summaryTotal)) < 0.01;
}

export const TRANSACTION_SORTS = ["newest", "oldest", "highest", "lowest"] as const;
export type TransactionSort = (typeof TRANSACTION_SORTS)[number];

export const TRANSACTION_SORT_LABELS: Record<TransactionSort, string> = {
  newest: "Latest first",
  oldest: "Oldest first",
  highest: "Highest amount",
  lowest: "Lowest amount",
};

export type TransactionFilter = {
  query?: string;
  /** Parent category name; only on Total Spending. */
  category?: string | null;
  /** Subcategory name or `NO_SUBCATEGORY`; only within one category. */
  subcategory?: string | null;
  sort?: TransactionSort;
};

function rowTime(e: Expense): string {
  return `${e.date ?? ""}T${e.time ?? "00:00"}`;
}

/**
 * Search, filter and sort already-eligible rows. Search matches the note,
 * category, subcategory and tags, case-insensitively; it never widens the set.
 */
export function filterSortExpenses(rows: readonly Expense[], filter: TransactionFilter): Expense[] {
  const needle = filter.query?.trim().toLowerCase() ?? "";
  const out = rows.filter((e) => {
    if (filter.category && e.category !== filter.category) return false;
    if (filter.subcategory) {
      if (filter.subcategory === NO_SUBCATEGORY ? Boolean(e.subcategory) : e.subcategory !== filter.subcategory) {
        return false;
      }
    }
    if (!needle) return true;
    const haystack = [e.note, e.category, e.subcategory, ...(e.tags ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });

  const sort = filter.sort ?? "newest";
  out.sort((a, b) => {
    if (sort === "highest") return b.amount - a.amount || rowTime(b).localeCompare(rowTime(a));
    if (sort === "lowest") return a.amount - b.amount || rowTime(b).localeCompare(rowTime(a));
    const byTime = rowTime(a).localeCompare(rowTime(b));
    return sort === "oldest" ? byTime : -byTime;
  });
  return out;
}

export type SpendingInsight = {
  id: string;
  title: string;
  body: string;
  tone: "neutral" | "up" | "down";
};

/** Months of earlier summaries an average needs before it is worth quoting. */
export const MIN_HISTORY_MONTHS = 3;

/**
 * Only what the data supports: each insight states its basis, and none is
 * produced from a missing or zero base. `series` is oldest-first and ends at
 * the selected month. Currency and date formatting stay with the caller.
 */
export function spendingInsights(input: {
  label: string;
  series: readonly MonthSpendPoint[];
  rows: readonly Pick<Expense, "amount" | "note" | "date">[];
  subcategories?: readonly SubcategoryShare[];
  formatMoney: (value: number) => string;
  formatDate: (date: string) => string;
}): { insights: SpendingInsight[]; insufficientHistory: boolean } {
  const { label, series, rows, subcategories, formatMoney, formatDate } = input;
  const insights: SpendingInsight[] = [];
  const current = series[series.length - 1];
  const earlier = series.slice(0, -1).filter((p) => p.hasData);

  const previous = series.length >= 2 ? series[series.length - 2] : undefined;
  const vsPrevious = current && previous?.hasData ? spendComparison(current.amount, previous.amount) : null;
  if (current && vsPrevious && vsPrevious.direction !== "flat") {
    const more = vsPrevious.direction === "up";
    insights.push({
      id: "vs-previous",
      title: `${Math.abs(Math.round(vsPrevious.pct))}% ${more ? "more" : "less"} than last month`,
      body: `${label}: ${formatMoney(current.amount)} this month against ${formatMoney(vsPrevious.previous)} last month.`,
      tone: more ? "up" : "down",
    });
  }

  const withSpend = earlier.filter((p) => p.amount > 0);
  if (current && withSpend.length >= MIN_HISTORY_MONTHS) {
    const average = withSpend.reduce((sum, p) => sum + p.amount, 0) / withSpend.length;
    const vsAverage = spendComparison(current.amount, average);
    if (vsAverage && Math.abs(vsAverage.pct) >= 1) {
      insights.push({
        id: "vs-average",
        title: `${Math.abs(Math.round(vsAverage.pct))}% ${vsAverage.direction === "up" ? "above" : "below"} your ${withSpend.length}-month average`,
        body: `The average over the ${withSpend.length} earlier months with spending is ${formatMoney(round2(average))}.`,
        tone: vsAverage.direction === "up" ? "up" : "down",
      });
    }
  }

  const top = subcategories?.find((s) => s.key !== NO_SUBCATEGORY);
  if (top && subcategories && subcategories.length > 1) {
    insights.push({
      id: "top-subcategory",
      title: `${top.label} leads this month`,
      body: `${Math.round(top.percentage)}% of ${label} (${formatMoney(top.amount)}).`,
      tone: "neutral",
    });
  }

  if (rows.length >= 2 && current && current.amount > 0) {
    const largest = rows.reduce((max, r) => (r.amount > max.amount ? r : max), rows[0]);
    const share = (largest.amount / current.amount) * 100;
    if (share >= 25) {
      insights.push({
        id: "largest",
        title: `One payment is ${Math.round(share)}% of this month`,
        body: `${largest.note?.trim() || "A single expense"} on ${formatDate(largest.date)}: ${formatMoney(largest.amount)}.`,
        tone: "neutral",
      });
    }
  }

  return { insights, insufficientHistory: withSpend.length < MIN_HISTORY_MONTHS };
}
