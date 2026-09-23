import {
  daysInMonth,
  monthFromDateKey,
  shiftDateKey,
  shiftMonthKey,
  todayDateKey,
} from "./dates";
import type { FilterableAccountActivity } from "./accountActivityFilters";

export const BALANCE_TREND_PERIODS = ["30d", "3m", "6m", "1y"] as const;
export type BalanceTrendPeriod = (typeof BALANCE_TREND_PERIODS)[number];

export const DEFAULT_BALANCE_TREND_PERIOD: BalanceTrendPeriod = "3m";

export const BALANCE_TREND_PERIOD_LABELS: Record<BalanceTrendPeriod, string> = {
  "30d": "30D",
  "3m": "3M",
  "6m": "6M",
  "1y": "1Y",
};

export interface BalanceTrendPoint {
  date: string;
  balance: number;
  /** True on days something actually posted, as opposed to a carried balance. */
  hasActivity: boolean;
}

export interface BalanceMarker {
  date: string;
  balance: number;
}

export interface AccountBalanceTrend {
  period: BalanceTrendPeriod;
  startDate: string;
  endDate: string;
  /** Chronological, oldest first. Empty when no balance can be determined. */
  points: BalanceTrendPoint[];
  opening?: BalanceMarker;
  current?: BalanceMarker;
  highest?: BalanceMarker;
  lowest?: BalanceMarker;
  /**
   * False for credit cards and for accounts with no known balance in the
   * period. Callers should show an explanation rather than an empty chart.
   */
  available: boolean;
}

export interface BalanceTrendOptions {
  /**
   * False for credit cards. `buildAccountActivities()` assigns them no running
   * balance, and an outstanding liability is not a balance to chart.
   */
  supportsRunningBalance?: boolean;
  /** Defaults to today in the device's timezone. */
  today?: string;
}

/** Same calendar day N months earlier, clamped to the shorter month. */
function monthsBack(dateKey: string, months: number): string {
  const day = Number(dateKey.slice(8, 10));
  const month = shiftMonthKey(monthFromDateKey(dateKey), -months);
  const [year, monthNumber] = month.split("-").map(Number);
  const clamped = Math.min(day, daysInMonth(year, monthNumber - 1));
  return `${month}-${String(clamped).padStart(2, "0")}`;
}

export function balanceTrendStartDate(
  period: BalanceTrendPeriod,
  today: string
): string {
  if (period === "30d") return shiftDateKey(today, -29);
  if (period === "3m") return monthsBack(today, 3);
  if (period === "6m") return monthsBack(today, 6);
  return monthsBack(today, 12);
}

/**
 * A daily balance series for the period.
 *
 * A balance is a step function: it changes on days something posts and holds
 * otherwise, so carrying the previous day's figure forward is the real balance
 * on that day, not invented data. What is never invented is a balance for days
 * before one is known — rows from before the account's balance baseline carry
 * no running balance, so the series simply starts later.
 */
export function buildAccountBalanceTrend(
  records: FilterableAccountActivity[],
  period: BalanceTrendPeriod,
  options: BalanceTrendOptions = {}
): AccountBalanceTrend {
  const { supportsRunningBalance = true, today = todayDateKey() } = options;
  const startDate = balanceTrendStartDate(period, today);
  const empty: AccountBalanceTrend = {
    period,
    startDate,
    endDate: today,
    points: [],
    available: false,
  };

  if (!supportsRunningBalance) return empty;

  // Records arrive newest-first, so the first entry for a date is that day's
  // closing balance.
  const closingByDate = new Map<string, number>();
  const activityDates = new Set<string>();
  let carried: number | undefined;

  for (const record of records) {
    const { date, runningBalance } = record.activity;
    if (date > today) continue;
    activityDates.add(date);
    if (runningBalance === undefined) continue;
    if (!closingByDate.has(date)) closingByDate.set(date, runningBalance);
    // The newest row before the window opens sets the opening balance.
    if (date < startDate && carried === undefined) carried = runningBalance;
  }

  const points: BalanceTrendPoint[] = [];
  let highest: BalanceMarker | undefined;
  let lowest: BalanceMarker | undefined;

  for (let date = startDate; date <= today; date = shiftDateKey(date, 1)) {
    const closing = closingByDate.get(date);
    if (closing !== undefined) carried = closing;
    // Nothing known yet: the account's history starts later in the window.
    if (carried === undefined) continue;

    const point: BalanceTrendPoint = {
      date,
      balance: carried,
      hasActivity: activityDates.has(date),
    };
    points.push(point);

    if (!highest || point.balance > highest.balance) {
      highest = { date, balance: point.balance };
    }
    if (!lowest || point.balance < lowest.balance) {
      lowest = { date, balance: point.balance };
    }
  }

  if (points.length === 0) return empty;

  return {
    period,
    startDate,
    endDate: today,
    points,
    opening: { date: points[0].date, balance: points[0].balance },
    current: {
      date: points[points.length - 1].date,
      balance: points[points.length - 1].balance,
    },
    highest,
    lowest,
    available: true,
  };
}

/**
 * Thins a long series for rendering while keeping its shape: the first and
 * last points and the extremes are always retained, so the chart never
 * disagrees with the markers shown beside it.
 */
export function downsampleBalanceTrend(
  points: BalanceTrendPoint[],
  maxPoints: number
): BalanceTrendPoint[] {
  if (maxPoints < 2 || points.length <= maxPoints) return points;

  const keep = new Set<number>([0, points.length - 1]);
  let highestIndex = 0;
  let lowestIndex = 0;
  points.forEach((point, index) => {
    if (point.balance > points[highestIndex].balance) highestIndex = index;
    if (point.balance < points[lowestIndex].balance) lowestIndex = index;
  });
  keep.add(highestIndex);
  keep.add(lowestIndex);

  const stride = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i += 1) {
    keep.add(Math.round(i * stride));
  }

  return [...keep]
    .sort((a, b) => a - b)
    .map((index) => points[index]);
}
