import type { DashboardPeriodSummary } from "@/shared/types/financialSummary";
import { topCategoryShares } from "@/shared/utils/dashboardWidgets";
import { shiftMonthKey } from "@/shared/utils/dates";
import { spendComparison } from "@/shared/utils/spendingDrilldown";

/**
 * SPENDLY-580 — Highest Spending Categories. A period is a set of whole
 * months; its category totals are the sum of those months'
 * `dashboard_{YYYY-MM}` summaries, ranked by `topCategoryShares` — the
 * dashboard donut's own rule and denominator — so one month here equals the
 * donut for that month exactly. Months without a summary are reported, never
 * counted as zero spend. Pure, no React Native.
 */

export const TOP_PERIODS = ["this_month", "last_month", "last_3_months", "this_year"] as const;
export type TopPeriod = (typeof TOP_PERIODS)[number];

export const TOP_PERIOD_LABELS: Record<TopPeriod, string> = {
  this_month: "This month",
  last_month: "Last month",
  last_3_months: "Last 3 months",
  this_year: "This year",
};

/** The months a period covers, oldest first, anchored on the selected month. */
export function periodMonths(period: TopPeriod, month: string): string[] {
  if (period === "this_month") return [month];
  if (period === "last_month") return [shiftMonthKey(month, -1)];
  if (period === "last_3_months") return [shiftMonthKey(month, -2), shiftMonthKey(month, -1), month];
  const count = Number(month.slice(5, 7));
  return Array.from({ length: count }, (_, i) => shiftMonthKey(month, i - count + 1));
}

/** The same span immediately before (this year → the same months last year). */
export function previousPeriodMonths(period: TopPeriod, month: string): string[] {
  if (period === "this_year") return periodMonths(period, month).map((m) => shiftMonthKey(m, -12));
  const months = periodMonths(period, month);
  return months.map((m) => shiftMonthKey(m, -months.length));
}

/** Summary docs a period (and its comparison) needs: a bounded window ending at `month`. */
export function topCategoriesWindow(period: TopPeriod, month: string): number {
  const months = [...periodMonths(period, month), ...previousPeriodMonths(period, month)];
  const oldest = months.reduce((a, b) => (a < b ? a : b));
  const [y1, m1] = oldest.split("-").map(Number);
  const [y2, m2] = month.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

export type PeriodTotals = {
  months: string[];
  /** Months in the period with no summary — their spending is unknown, not zero. */
  missingMonths: string[];
  /** Summed `categoryTotals` (parent and `Parent::Sub` keys) over the months that exist. */
  categoryTotals: Record<string, number>;
};

export function periodCategoryTotals(
  summaries: readonly Pick<DashboardPeriodSummary, "period" | "categoryTotals">[],
  months: readonly string[]
): PeriodTotals {
  const byMonth = new Map(summaries.map((s) => [s.period, s]));
  const totals: Record<string, number> = {};
  const missingMonths: string[] = [];
  for (const m of months) {
    const summary = byMonth.get(m);
    if (!summary) {
      missingMonths.push(m);
      continue;
    }
    for (const [key, amount] of Object.entries(summary.categoryTotals ?? {})) {
      if (Number.isFinite(amount)) totals[key] = Math.round(((totals[key] ?? 0) + amount) * 100) / 100;
    }
  }
  return { months: [...months], missingMonths, categoryTotals: totals };
}

export type RankedCategory = { rank: number; category: string; amount: number; percentage: number };

export function rankCategories(categoryTotals: Record<string, number>): { ranked: RankedCategory[]; total: number } {
  const { categories, totalSpent } = topCategoryShares(categoryTotals, Number.MAX_SAFE_INTEGER);
  return {
    ranked: categories.map((c, i) => ({ rank: i + 1, category: c.category, amount: c.amount, percentage: c.percentage })),
    total: totalSpent,
  };
}

export type TopInsight = { id: string; title: string; body: string; tone: "up" | "down" | "neutral" };

/**
 * The fewest top categories that make up at least half of spending (always
 * computable when there is spending), and — only when the previous period's
 * months all have summaries — the category that moved most against it.
 */
export function topCategoryInsights(input: {
  current: PeriodTotals;
  previous: PeriodTotals;
  periodLabel: string;
  formatMoney: (n: number) => string;
}): { insights: TopInsight[]; comparable: boolean } {
  const { current, previous, periodLabel, formatMoney } = input;
  const { ranked, total } = rankCategories(current.categoryTotals);
  const insights: TopInsight[] = [];
  if (total > 0 && ranked.length >= 2) {
    let share = 0;
    const leaders: RankedCategory[] = [];
    for (const c of ranked) {
      leaders.push(c);
      share += c.percentage;
      if (share >= 50) break;
    }
    const names = leaders.map((c) => c.category);
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    insights.push({
      id: "concentration",
      title: `${list} ${names.length === 1 ? "is" : "are"} ${Math.round(share)}% of spending`,
      body: `${formatMoney(leaders.reduce((s, c) => s + c.amount, 0))} of ${formatMoney(total)} ${periodLabel.toLowerCase()}.`,
      tone: "neutral",
    });
  }

  const comparable = previous.missingMonths.length === 0 && current.missingMonths.length === 0;
  if (comparable && total > 0) {
    const before = previous.categoryTotals;
    const moves = ranked
      .map((c) => ({ c, cmp: spendComparison(c.amount, before[c.category]) }))
      .filter((m): m is { c: RankedCategory; cmp: NonNullable<typeof m.cmp> } => m.cmp !== null && Math.abs(m.cmp.pct) >= 10 && Math.abs(m.cmp.delta) >= total * 0.05)
      .sort((a, b) => Math.abs(b.cmp.delta) - Math.abs(a.cmp.delta));
    const top = moves[0];
    if (top) {
      const up = top.cmp.delta > 0;
      insights.push({
        id: `move-${top.c.category}`,
        title: `${top.c.category} ${up ? "rose" : "fell"} ${Math.abs(Math.round(top.cmp.pct))}%`,
        body: `${formatMoney(top.c.amount)} against ${formatMoney(top.cmp.previous)} in the previous ${periodLabel.toLowerCase().replace(/^this |^last /, "")}.`,
        tone: up ? "up" : "down",
      });
    }
  }
  return { insights, comparable };
}

/** The month a category page should open on for a period (it shows one month). */
export function categoryMonthForPeriod(period: TopPeriod, month: string): string {
  return period === "last_month" ? shiftMonthKey(month, -1) : month;
}

export function topCategoriesHref(month: string, period?: TopPeriod): string {
  const query = [`month=${encodeURIComponent(month)}`];
  if (period && period !== "this_month") query.push(`period=${period}`);
  return `/top-categories?${query.join("&")}`;
}
