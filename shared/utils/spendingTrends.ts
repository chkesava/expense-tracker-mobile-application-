import type { Expense } from "@/shared/types/expense";
import type { DashboardPeriodSummary } from "@/shared/types/financialSummary";
import { shiftMonthKey } from "@/shared/utils/dates";
import { topCategoryShares } from "@/shared/utils/dashboardWidgets";
import {
  MIN_HISTORY_MONTHS,
  categorizedSpendTotal,
  eligibleExpenses,
  monthlySpendSeries,
  spendComparison,
  type SpendComparison,
} from "@/shared/utils/spendingDrilldown";

/**
 * SPENDLY-578 — Spending Trends. Two sources, each with the dashboard's own
 * rule, so every figure reconciles with the donut for the same period:
 *
 * - monthly and yearly points sum the `dashboard_{YYYY-MM}` summaries'
 *   parent-category totals (`categorizedSpendTotal`);
 * - daily and weekly points split one month's ledger rows under the
 *   summary's inclusion rule (`eligibleExpenses`), so a month's days add up
 *   to that month's total once its rows are loaded.
 *
 * Nothing is extrapolated: a point with no data says so (`hasData: false`)
 * instead of reading as a zero, and comparisons need a real, non-zero base.
 * Pure, no React Native.
 */

export const TREND_GRANULARITIES = ["daily", "weekly", "monthly", "yearly"] as const;
export type TrendGranularity = (typeof TREND_GRANULARITIES)[number];

export const TRENDS_TABS = ["overview", "categories", "comparison", "insights"] as const;
export type TrendsTab = (typeof TRENDS_TABS)[number];

export type TrendPoint = {
  /** Day `YYYY-MM-DD`, week start `YYYY-MM-DD`, month `YYYY-MM` or year `YYYY`. */
  key: string;
  /** Short axis label. */
  label: string;
  /** Full label for the selected-point tooltip and screen readers. */
  detailLabel: string;
  amount: number;
  hasData: boolean;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function daysIn(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function dayKey(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, "0")}`;
}

function monthName(month: string): string {
  return MONTHS[Number(month.slice(5, 7)) - 1] ?? month;
}

/** Spend per day of `month`; days after today have no data yet. */
export function dailySeries(expenses: readonly Expense[], month: string, todayKey: string): TrendPoint[] {
  const byDay = new Map<string, number>();
  for (const e of eligibleExpenses(expenses, month)) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.amount);
  const points: TrendPoint[] = [];
  for (let d = 1; d <= daysIn(month); d += 1) {
    const key = dayKey(month, d);
    points.push({
      key,
      label: d === 1 || d % 5 === 0 ? String(d) : "",
      detailLabel: `${d} ${monthName(month)}`,
      amount: Math.round((byDay.get(key) ?? 0) * 100) / 100,
      hasData: key <= todayKey,
    });
  }
  // A row whose `month` field puts it in this month but whose date falls
  // outside it (the summary's rule) still counts — on the last day, so the
  // days always add up to the month.
  const inside = points.reduce((s, p) => s + p.amount, 0);
  const all = eligibleExpenses(expenses, month).reduce((s, e) => s + e.amount, 0);
  const stray = Math.round((all - inside) * 100) / 100;
  if (Math.abs(stray) >= 0.01) points[points.length - 1].amount = Math.round((points[points.length - 1].amount + stray) * 100) / 100;
  return points;
}

/**
 * Spend per week of `month`, weeks starting on `firstDayOfWeek` and clipped to
 * the month (so a week never borrows days from the neighbouring month).
 */
export function weeklySeries(
  expenses: readonly Expense[],
  month: string,
  firstDayOfWeek: "monday" | "sunday",
  todayKey: string
): TrendPoint[] {
  const days = dailySeries(expenses, month, todayKey);
  const startDow = firstDayOfWeek === "sunday" ? 0 : 1;
  const weeks: TrendPoint[] = [];
  let current: { first: number; last: number; amount: number } | null = null;
  days.forEach((day, i) => {
    const dom = i + 1;
    const dow = new Date(`${day.key}T00:00:00`).getDay();
    if (!current || dow === startDow) {
      if (current) weeks.push(toWeek(current));
      current = { first: dom, last: dom, amount: 0 };
    }
    current.last = dom;
    current.amount += day.amount;
  });
  if (current) weeks.push(toWeek(current));
  return weeks;

  function toWeek(w: { first: number; last: number; amount: number }): TrendPoint {
    const name = monthName(month);
    return {
      key: dayKey(month, w.first),
      label: `${w.first}–${w.last}`,
      detailLabel: `${w.first}–${w.last} ${name}`,
      amount: Math.round(w.amount * 100) / 100,
      hasData: dayKey(month, w.first) <= todayKey,
    };
  }
}

/** The last `count` months, from the summaries. */
export function monthlyTrend(summaries: readonly Pick<DashboardPeriodSummary, "period" | "categoryTotals">[], endMonth: string, count: number): TrendPoint[] {
  return monthlySpendSeries(summaries, endMonth, count).map((p) => ({
    key: p.month,
    label: monthName(p.month),
    detailLabel: `${monthName(p.month)} ${p.month.slice(0, 4)}`,
    amount: p.amount,
    hasData: p.hasData,
  }));
}

/**
 * Calendar years ending with `endMonth`'s year, summed from the summaries.
 * The current year runs only to `endMonth` and says so in its label; a year
 * with no summary at all has no data.
 */
export function yearlyTrend(
  summaries: readonly Pick<DashboardPeriodSummary, "period" | "categoryTotals">[],
  endMonth: string,
  years: number
): TrendPoint[] {
  const endYear = Number(endMonth.slice(0, 4));
  const points: TrendPoint[] = [];
  for (let y = endYear - Math.max(1, years) + 1; y <= endYear; y += 1) {
    const inYear = summaries.filter((s) => s.period.startsWith(`${y}-`) && s.period <= endMonth);
    const amount = inYear.reduce((sum, s) => sum + categorizedSpendTotal(s.categoryTotals), 0);
    const partial = y === endYear && endMonth.slice(5, 7) !== "12";
    points.push({
      key: String(y),
      label: String(y),
      detailLabel: partial ? `${y} (Jan–${monthName(endMonth)})` : String(y),
      amount: Math.round(amount * 100) / 100,
      hasData: inYear.length > 0,
    });
  }
  return points;
}

/** How many monthly summaries a granularity needs (the bounded window to listen to). */
export function summaryWindowFor(granularity: TrendGranularity, yearlyYears = 3): number {
  if (granularity === "yearly") return 12 * yearlyYears;
  return 13; // six months shown, twelve back for year-over-year, plus the month itself
}

export type SeriesStats = {
  /** Over points with data. Null with none. */
  average: number | null;
  highest: TrendPoint | null;
  lowest: TrendPoint | null;
  /** The last point with data against the one before it. */
  change: (SpendComparison & { from: TrendPoint; to: TrendPoint }) | null;
  pointsWithData: number;
};

export function seriesStats(points: readonly TrendPoint[]): SeriesStats {
  const withData = points.filter((p) => p.hasData);
  if (withData.length === 0) return { average: null, highest: null, lowest: null, change: null, pointsWithData: 0 };
  const average = Math.round((withData.reduce((s, p) => s + p.amount, 0) / withData.length) * 100) / 100;
  const highest = withData.reduce((m, p) => (p.amount > m.amount ? p : m));
  const lowest = withData.reduce((m, p) => (p.amount < m.amount ? p : m));
  const to = withData[withData.length - 1];
  const from = withData.length >= 2 ? withData[withData.length - 2] : null;
  const cmp = from ? spendComparison(to.amount, from.amount) : null;
  return {
    average,
    highest,
    lowest,
    change: cmp && from ? { ...cmp, from, to } : null,
    pointsWithData: withData.length,
  };
}

export type CategoryMovement = {
  category: string;
  amount: number;
  previous: number;
  delta: number;
  /** Null when last month had nothing in this category (no base for a %). */
  pct: number | null;
  share: number;
};

/** Each parent category this month against last month, largest first. */
export function categoryMovements(
  current: Record<string, number> | null | undefined,
  previous: Record<string, number> | null | undefined
): CategoryMovement[] {
  const { categories } = topCategoryShares(current, Number.MAX_SAFE_INTEGER);
  const before = previous ?? {};
  // Categories that dropped to nothing this month still moved.
  const gone = Object.entries(before)
    .filter(([key, amount]) => !key.includes("::") && amount > 0 && !(current ?? {})[key])
    .map(([category]) => ({ category, amount: 0, percentage: 0 }));
  return [...categories, ...gone].map((c) => {
    const prev = Math.max(0, before[c.category] ?? 0);
    const delta = Math.round((c.amount - prev) * 100) / 100;
    return {
      category: c.category,
      amount: c.amount,
      previous: prev,
      delta,
      pct: prev > 0 ? (delta / prev) * 100 : null,
      share: c.percentage,
    };
  });
}

export type TrendInsight = { id: string; title: string; body: string; tone: "up" | "down" | "neutral" };

/**
 * Insights only where the data carries them: a month-over-month change needs
 * last month's summary, a category move needs a base and a material size, and
 * an average needs `MIN_HISTORY_MONTHS` earlier months with spending.
 */
export function trendInsights(input: {
  summaries: readonly Pick<DashboardPeriodSummary, "period" | "categoryTotals">[];
  month: string;
  weeks?: readonly TrendPoint[];
  formatMoney: (n: number) => string;
}): { insights: TrendInsight[]; insufficientHistory: boolean } {
  const { summaries, month, weeks, formatMoney } = input;
  const byMonth = new Map(summaries.map((s) => [s.period, s]));
  const current = byMonth.get(month);
  const previous = byMonth.get(shiftMonthKey(month, -1));
  const out: TrendInsight[] = [];
  const total = categorizedSpendTotal(current?.categoryTotals);

  const mom = previous ? spendComparison(total, categorizedSpendTotal(previous.categoryTotals)) : null;
  if (mom && mom.direction !== "flat") {
    out.push({
      id: "mom",
      title: `${Math.abs(Math.round(mom.pct))}% ${mom.direction === "up" ? "more" : "less"} than last month`,
      body: `${formatMoney(total)} this month, ${formatMoney(mom.previous)} last month (${mom.delta > 0 ? "+" : "−"}${formatMoney(Math.abs(mom.delta))}).`,
      tone: mom.direction === "up" ? "up" : "down",
    });
  }

  const earlier = monthlySpendSeries(summaries, shiftMonthKey(month, -1), 6).filter((p) => p.hasData && p.amount > 0);
  if (earlier.length >= MIN_HISTORY_MONTHS && total > 0) {
    const avg = earlier.reduce((s, p) => s + p.amount, 0) / earlier.length;
    const vs = spendComparison(total, avg);
    if (vs && Math.abs(vs.pct) >= 1) {
      out.push({
        id: "avg",
        title: `${Math.abs(Math.round(vs.pct))}% ${vs.direction === "up" ? "above" : "below"} your ${earlier.length}-month average`,
        body: `The average over the ${earlier.length} earlier months with spending is ${formatMoney(Math.round(avg * 100) / 100)}.`,
        tone: vs.direction === "up" ? "up" : "down",
      });
    }
  }

  if (previous && current) {
    // A move worth naming: at least 10% and at least 5% of this month's spend.
    const material = categoryMovements(current.categoryTotals, previous.categoryTotals).filter(
      (m) => m.pct !== null && Math.abs(m.pct) >= 10 && Math.abs(m.delta) >= total * 0.05
    );
    const up = material.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta)[0];
    const down = material.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta)[0];
    if (up) {
      out.push({
        id: `up-${up.category}`,
        title: `${up.category} rose ${Math.round(up.pct!)}%`,
        body: `${formatMoney(up.amount)} this month, up from ${formatMoney(up.previous)}.`,
        tone: "up",
      });
    }
    if (down) {
      out.push({
        id: `down-${down.category}`,
        title: `${down.category} fell ${Math.abs(Math.round(down.pct!))}%`,
        body: `${formatMoney(down.amount)} this month, down from ${formatMoney(down.previous)}.`,
        tone: "down",
      });
    }
  }

  const spentWeeks = (weeks ?? []).filter((w) => w.hasData && w.amount > 0);
  if (spentWeeks.length >= 2) {
    const top = spentWeeks.reduce((m, w) => (w.amount > m.amount ? w : m));
    out.push({
      id: "top-week",
      title: `Highest week: ${top.detailLabel}`,
      body: `${formatMoney(top.amount)} spent that week.`,
      tone: "neutral",
    });
  }

  return { insights: out, insufficientHistory: !previous || earlier.length < MIN_HISTORY_MONTHS };
}

export function trendsHref(month: string, options: { granularity?: TrendGranularity; tab?: TrendsTab } = {}): string {
  const query = [`month=${encodeURIComponent(month)}`];
  if (options.granularity && options.granularity !== "monthly") query.push(`gran=${options.granularity}`);
  if (options.tab && options.tab !== "overview") query.push(`tab=${options.tab}`);
  return `/trends?${query.join("&")}`;
}
