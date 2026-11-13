/**
 * Dashboard "Spending by Day" heatmap — pure calculation utilities.
 *
 * Eligible spend for a day comes straight from `JournalRecord`s: the
 * Journal's row set already excludes transfers, credit-card bill payments,
 * borrowings and investments structurally (see `journalActivities.ts`), so
 * this file never re-derives that exclusion. It only has to additionally
 * drop income rows (`type !== "debit"`) and refunds/cashback (`isRefund`),
 * both already classified once by `classifyActivitySpecials`.
 *
 * `JournalRecord.activity.date` is already a local `YYYY-MM-DD` key, fixed at
 * the moment the expense was entered (see `dates.ts`) — there is no instant
 * to convert here, so no separate timezone parameter is needed.
 */
import { daysInMonth, firstDayIndex, monthFromDateKey, type FirstDayOfWeek } from "../dates";
import type { JournalRecord } from "../journalActivities";
import { roundMoney } from "../money";

export interface DailySpendingBucket {
  /** YYYY-MM-DD */
  date: string;
  /** Eligible spend for the day — debit rows only, refunds excluded. */
  total: number;
  transactionCount: number;
}

/**
 * One bucket per calendar day of `monthKey`, always a full set (28–31
 * entries) even when a day had no eligible spending.
 */
export function buildDailySpendingBuckets(
  records: readonly JournalRecord[],
  monthKey: string
): DailySpendingBucket[] {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const dayCount = daysInMonth(year, monthIndex);
  const totals = new Map<string, { total: number; count: number }>();

  for (const record of records) {
    const date = record.activity.date;
    if (!date || monthFromDateKey(date) !== monthKey) continue;
    if (record.activity.type !== "debit" || record.isRefund) continue;
    const entry = totals.get(date) ?? { total: 0, count: 0 };
    entry.total += record.activity.amount;
    entry.count += 1;
    totals.set(date, entry);
  }

  return Array.from({ length: dayCount }, (_, i) => {
    const date = `${monthKey}-${String(i + 1).padStart(2, "0")}`;
    const entry = totals.get(date);
    return {
      date,
      total: roundMoney(entry?.total ?? 0),
      transactionCount: entry?.count ?? 0,
    };
  });
}

/** `null` marks a padding cell before day 1 or after the month's last day. */
export type HeatmapGridCell = string | null;

/**
 * A GitHub-contribution-style 7-column grid for `monthKey`: one row per
 * calendar week, padded with `null` cells so day 1 lands in its true weekday
 * column regardless of what weekday the month starts on.
 */
export function monthGridWeeks(
  monthKey: string,
  firstDay: FirstDayOfWeek = "sunday"
): HeatmapGridCell[][] {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const dayCount = daysInMonth(year, monthIndex);
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const leadingPad = (firstWeekday - firstDayIndex(firstDay) + 7) % 7;

  const cells: HeatmapGridCell[] = [
    ...Array.from({ length: leadingPad }, () => null),
    ...Array.from({ length: dayCount }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, "0")}`),
  ];
  const trailingPad = (7 - (cells.length % 7)) % 7;
  for (let i = 0; i < trailingPad; i++) cells.push(null);

  const weeks: HeatmapGridCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const HEATMAP_INTENSITY_LEVELS = [0, 1, 2, 3, 4] as const;
export type HeatmapIntensity = (typeof HEATMAP_INTENSITY_LEVELS)[number];

/**
 * 5-level, month-relative scale: `scaleMax` is the month's own highest day,
 * so a light month and a heavy month each get a meaningful spread instead of
 * a fixed currency threshold that would wash out for very different budgets.
 */
export function intensityLevel(amount: number, scaleMax: number): HeatmapIntensity {
  if (amount <= 0 || scaleMax <= 0) return 0;
  const ratio = Math.min(1, amount / scaleMax);
  if (ratio <= 0.01) return 0;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

/** The day with the highest eligible spend. Ties keep the earliest date. */
export function highestSpendingDay(buckets: readonly DailySpendingBucket[]): DailySpendingBucket | null {
  let best: DailySpendingBucket | null = null;
  for (const bucket of buckets) {
    if (bucket.total <= 0) continue;
    if (!best || bucket.total > best.total) best = bucket;
  }
  return best;
}

export type SpendingAverageDenominator = "activeDays" | "allDaysInMonth";

/**
 * Average daily spend. `"activeDays"` divides by days that actually had
 * spending; `"allDaysInMonth"` divides by every calendar day, including
 * zero-spend ones. The two can differ a lot in a light-spending month, so
 * callers must show which one is displayed rather than picking silently.
 */
export function averageDailySpend(
  buckets: readonly DailySpendingBucket[],
  denominator: SpendingAverageDenominator
): number {
  const total = buckets.reduce((sum, bucket) => sum + bucket.total, 0);
  const active = buckets.filter((bucket) => bucket.total > 0).length;
  const count = denominator === "activeDays" ? active : buckets.length;
  if (count === 0) return 0;
  return roundMoney(total / count);
}

export function activeDaysCount(buckets: readonly DailySpendingBucket[]): { active: number; total: number } {
  return {
    active: buckets.filter((bucket) => bucket.total > 0).length,
    total: buckets.length,
  };
}

export interface SpendingHeatmapAccessibilityRow {
  label: string;
  detail: string;
}

/** Text/table fallback for screen readers and non-visual consumers. */
export function dailySpendingAccessibilityRows(
  buckets: readonly DailySpendingBucket[],
  formatAmount: (amount: number) => string
): SpendingHeatmapAccessibilityRow[] {
  return buckets.map((bucket) => ({
    label: bucket.date,
    detail:
      bucket.total > 0
        ? `${formatAmount(bucket.total)} across ${bucket.transactionCount} transaction${bucket.transactionCount === 1 ? "" : "s"}`
        : "No spending",
  }));
}
