import type { CategoryBudgetAlertItem } from "@/shared/utils/dashboardWidgets";
import { topCategoryShares } from "@/shared/utils/dashboardWidgets";
import { daysInMonthOf, type SpendlyBudget } from "@/shared/utils/spendlyBudget";

/**
 * SPENDLY-575 — the Budget Progress drill-downs. Nothing here decides what a
 * budget is or when it is at risk: the per-budget figures and flags come from
 * `computeActiveCategoryBudgets` (over = spent > amount, warning = ≥ 80% and
 * not over) and the monthly budget from `computeSpendlyBudget`, exactly as the
 * dashboard's budget cards use them. This file only groups, counts and routes.
 * Pure, no React Native.
 */

export const BUDGET_OVERVIEW_TABS = ["categories", "insights", "trends", "transactions"] as const;
export type BudgetOverviewTab = (typeof BUDGET_OVERVIEW_TABS)[number];

export const BUDGET_DETAIL_TABS = ["overview", "transactions", "subcategories", "insights"] as const;
export type BudgetDetailTab = (typeof BUDGET_DETAIL_TABS)[number];

export type BudgetStatus = "over" | "atRisk" | "onTrack";

/** The status the existing flags already imply; no threshold of its own. */
export function budgetStatusOf(item: Pick<CategoryBudgetAlertItem, "isOver" | "isWarning">): BudgetStatus {
  if (item.isOver) return "over";
  if (item.isWarning) return "atRisk";
  return "onTrack";
}

/** The same wording the dashboard's Category Budgets rows use. */
export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  over: "Over limit",
  atRisk: "Close to limit",
  onTrack: "On track",
};

export function budgetStatusCounts(items: readonly Pick<CategoryBudgetAlertItem, "isOver" | "isWarning">[]) {
  const counts = { onTrack: 0, atRisk: 0, over: 0, total: items.length };
  for (const item of items) counts[budgetStatusOf(item)] += 1;
  return counts;
}

/** Spent as a share of the limit, not capped at 100 (the stored `pct` is). */
export function budgetUsedPct(item: Pick<CategoryBudgetAlertItem, "spent" | "amount">): number {
  return item.amount > 0 ? (item.spent / item.amount) * 100 : 0;
}

/**
 * Totals across a month's category budgets without counting money twice: a
 * subcategory budget whose parent also has a budget is already inside the
 * parent's figures, so only parent budgets and "orphan" subcategory budgets
 * add up. Spent comes from the same items, i.e. the summary's category totals.
 */
export function categoryBudgetRollup(items: readonly CategoryBudgetAlertItem[]): {
  budgeted: number;
  spent: number;
  remaining: number;
  usedPct: number;
} {
  const parents = new Set(items.filter((b) => !b.subcategory).map((b) => b.category));
  let budgeted = 0;
  let spent = 0;
  for (const b of items) {
    if (b.subcategory && parents.has(b.category)) continue;
    budgeted += b.amount;
    spent += b.spent;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    budgeted: round(budgeted),
    spent: round(spent),
    remaining: round(budgeted - spent),
    usedPct: budgeted > 0 ? (spent / budgeted) * 100 : 0,
  };
}

/** Over-limit first, then close to limit, then the rest; fuller budgets first within each. */
export function sortBudgetItems<T extends CategoryBudgetAlertItem>(items: readonly T[]): T[] {
  const rank: Record<BudgetStatus, number> = { over: 0, atRisk: 1, onTrack: 2 };
  return [...items].sort(
    (a, b) => rank[budgetStatusOf(a)] - rank[budgetStatusOf(b)] || budgetUsedPct(b) - budgetUsedPct(a)
  );
}

/** A budget's display name: "Food", or "Food › Groceries" for a subcategory budget. */
export function budgetLabel(item: Pick<CategoryBudgetAlertItem, "category" | "subcategory">): string {
  return item.subcategory ? `${item.category} › ${item.subcategory}` : item.category;
}

/**
 * The day-of-month to hand `computeSpendlyBudget` for pace and days left: today
 * in the current month, the whole month for a past one (it is over), and day 1
 * for a future one (nothing has elapsed).
 */
export function budgetDayOfMonth(month: string, todayKey: string): number {
  const current = todayKey.slice(0, 7);
  if (month < current) return daysInMonthOf(month);
  if (month > current) return 1;
  return Math.max(1, Number(todayKey.slice(8, 10)) || 1);
}

/** Parent categories with spending this month and no budget of any kind. */
export function unbudgetedSpending(
  categoryTotals: Record<string, number> | null | undefined,
  items: readonly Pick<CategoryBudgetAlertItem, "category">[]
): { categories: { category: string; amount: number }[]; total: number } {
  const budgeted = new Set(items.map((b) => b.category));
  const categories = topCategoryShares(categoryTotals, Number.MAX_SAFE_INTEGER)
    .categories.filter((c) => !budgeted.has(c.category))
    .map((c) => ({ category: c.category, amount: c.amount }));
  return { categories, total: Math.round(categories.reduce((s, c) => s + c.amount, 0) * 100) / 100 };
}

export function budgetsHref(month: string, tab?: BudgetOverviewTab): string {
  const query = [`month=${encodeURIComponent(month)}`];
  if (tab && tab !== "categories") query.push(`tab=${tab}`);
  return `/budgets?${query.join("&")}`;
}

export function budgetDetailHref(
  category: string,
  month: string,
  options: { subcategory?: string; tab?: BudgetDetailTab } = {}
): string {
  const query = [`month=${encodeURIComponent(month)}`];
  if (options.subcategory) query.push(`sub=${encodeURIComponent(options.subcategory)}`);
  if (options.tab && options.tab !== "overview") query.push(`tab=${options.tab}`);
  return `/budgets/${encodeURIComponent(category)}?${query.join("&")}`;
}

/** The budget a detail page shows: the subcategory's when asked for, else the parent's. */
export function findBudget<T extends Pick<CategoryBudgetAlertItem, "category" | "subcategory">>(
  items: readonly T[],
  category: string,
  subcategory?: string | null
): T | null {
  return items.find((b) => b.category === category && (b.subcategory ?? null) === (subcategory || null)) ?? null;
}

export type BudgetInsight = { id: string; title: string; body: string; tone: "up" | "down" | "neutral" };

/**
 * The overview's insights. Each one restates a figure the budget functions
 * already computed; pace is only quoted for the month in progress, because a
 * finished month has no pace to keep.
 */
export function budgetOverviewInsights(input: {
  items: readonly CategoryBudgetAlertItem[];
  /** `computeSpendlyBudget` for the monthly budget, when one is set. */
  monthly: Pick<SpendlyBudget, "isOverBudget" | "isOverPace" | "projectedMonthEnd" | "remaining" | "requiredDailyLimit" | "daysLeft"> | null;
  monthlyBudget: number;
  isCurrentMonth: boolean;
  unbudgeted: { categories: { category: string; amount: number }[]; total: number };
  formatMoney: (value: number) => string;
}): BudgetInsight[] {
  const { items, monthly, monthlyBudget, isCurrentMonth, unbudgeted, formatMoney } = input;
  const out: BudgetInsight[] = [];

  if (monthly && monthlyBudget > 0) {
    if (monthly.isOverBudget) {
      out.push({
        id: "monthly-over",
        title: `Monthly budget exceeded by ${formatMoney(-monthly.remaining)}`,
        body: `Spending has passed the ${formatMoney(monthlyBudget)} monthly budget.`,
        tone: "up",
      });
    } else if (isCurrentMonth && monthly.isOverPace) {
      out.push({
        id: "monthly-pace",
        title: `On pace for ${formatMoney(monthly.projectedMonthEnd)} this month`,
        body: `That is above the ${formatMoney(monthlyBudget)} budget. Keeping to ${formatMoney(monthly.requiredDailyLimit)} a day for the next ${monthly.daysLeft} days stays within it.`,
        tone: "up",
      });
    } else if (isCurrentMonth && monthly.daysLeft > 0) {
      out.push({
        id: "monthly-daily",
        title: `${formatMoney(monthly.requiredDailyLimit)} a day keeps you on budget`,
        body: `${formatMoney(monthly.remaining)} left for the next ${monthly.daysLeft} days.`,
        tone: "down",
      });
    }
  }

  for (const item of sortBudgetItems(items)) {
    const status = budgetStatusOf(item);
    if (status === "over") {
      out.push({
        id: `over-${item.id}`,
        title: `${budgetLabel(item)} is ${formatMoney(item.spent - item.amount)} over`,
        body: `${formatMoney(item.spent)} spent against a ${formatMoney(item.amount)} budget.`,
        tone: "up",
      });
    } else if (status === "atRisk") {
      out.push({
        id: `risk-${item.id}`,
        title: `${budgetLabel(item)} has used ${Math.round(budgetUsedPct(item))}%`,
        body: `${formatMoney(item.amount - item.spent)} left of ${formatMoney(item.amount)}.`,
        tone: "neutral",
      });
    }
  }

  if (unbudgeted.total > 0) {
    const names = unbudgeted.categories.slice(0, 3).map((c) => c.category).join(", ");
    out.push({
      id: "unbudgeted",
      title: `${formatMoney(unbudgeted.total)} spent without a budget`,
      body: `In ${names}${unbudgeted.categories.length > 3 ? ` and ${unbudgeted.categories.length - 3} more` : ""}.`,
      tone: "neutral",
    });
  }
  return out;
}

/** One budget's insights: where it stands, its pace (current month only), and the change from last month. */
export function budgetDetailInsights(input: {
  label: string;
  spent: number;
  amount: number;
  pace: Pick<SpendlyBudget, "projectedMonthEnd" | "requiredDailyLimit" | "daysLeft" | "isOverPace">;
  isCurrentMonth: boolean;
  previousSpent: number | null;
  formatMoney: (value: number) => string;
}): BudgetInsight[] {
  const { label, spent, amount, pace, isCurrentMonth, previousSpent, formatMoney } = input;
  const out: BudgetInsight[] = [];
  const left = amount - spent;
  if (left < 0) {
    out.push({ id: "over", title: `${formatMoney(-left)} over budget`, body: `${label} has spent ${formatMoney(spent)} of ${formatMoney(amount)}.`, tone: "up" });
  } else if (isCurrentMonth && pace.daysLeft > 0) {
    out.push({
      id: "daily",
      title: `${formatMoney(pace.requiredDailyLimit)} a day for ${pace.daysLeft} days`,
      body: `Keeps ${label} within its ${formatMoney(amount)} budget (${formatMoney(left)} left).`,
      tone: "down",
    });
  }
  if (isCurrentMonth && left >= 0 && pace.isOverPace) {
    out.push({
      id: "pace",
      title: `On pace for ${formatMoney(pace.projectedMonthEnd)}`,
      body: `At this month's rate, ${label} would end above its budget.`,
      tone: "up",
    });
  }
  if (previousSpent != null && previousSpent > 0 && spent > 0) {
    const pct = Math.round(((spent - previousSpent) / previousSpent) * 100);
    if (pct !== 0) {
      out.push({
        id: "vs-previous",
        title: `${Math.abs(pct)}% ${pct > 0 ? "more" : "less"} than last month`,
        body: `${formatMoney(spent)} this month, ${formatMoney(previousSpent)} last month.`,
        tone: pct > 0 ? "up" : "down",
      });
    }
  }
  return out;
}

export type BudgetHistoryPoint = { month: string; budgeted: number; spent: number; usedPct: number; count: number };

/**
 * Category budgets against spending, month by month, for the months that had
 * budgets and a summary. Each month runs through `computeActiveCategoryBudgets`
 * and the non-overlapping rollup, the same as the selected month.
 */
export function monthlyBudgetHistory(
  budgets: readonly { id: string; category: string; subcategory?: string; amount: number; month: string }[],
  summaries: readonly { period: string; categoryTotals: Record<string, number> }[],
  months: readonly string[],
  compute: (
    budgets: { id: string; category: string; subcategory?: string; amount: number; month: string }[],
    totals: Record<string, number>,
    month: string
  ) => CategoryBudgetAlertItem[]
): BudgetHistoryPoint[] {
  const byMonth = new Map(summaries.map((s) => [s.period, s]));
  const out: BudgetHistoryPoint[] = [];
  for (const month of months) {
    const summary = byMonth.get(month);
    const items = compute([...budgets], summary?.categoryTotals ?? {}, month);
    if (items.length === 0) continue;
    const rollup = categoryBudgetRollup(items);
    out.push({ month, budgeted: rollup.budgeted, spent: rollup.spent, usedPct: rollup.usedPct, count: items.length });
  }
  return out;
}

/**
 * The status of a group of budgets (the month's rollup, a past month's
 * total), by the same rule a single budget uses: over when spent passes the
 * limit, close to it from 80% (`computeActiveCategoryBudgets`' warning line).
 */
export function rollupStatus(rollup: { spent: number; budgeted: number; usedPct: number }): BudgetStatus {
  if (rollup.spent > rollup.budgeted) return "over";
  if (rollup.usedPct >= 80) return "atRisk";
  return "onTrack";
}
