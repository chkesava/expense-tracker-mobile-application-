import type { Expense } from "@/shared/types/expense";
import { BADGES, type UserStats } from "@/shared/types/stats";
import { isValidDateKey, shiftDateKey } from "@/shared/utils/dates";

/** Pull a YYYY-MM-DD key from expense.date (calendar key or ISO datetime). */
export function expenseDateKey(date: string | undefined | null): string | null {
  if (!date) return null;
  const key = date.slice(0, 10);
  return isValidDateKey(key) ? key : null;
}

export function collectExpenseDateKeys(expenses: Expense[]): Set<string> {
  const dates = new Set<string>();
  for (const expense of expenses) {
    const key = expenseDateKey(expense.date);
    if (key) dates.add(key);
  }
  return dates;
}

/**
 * Consecutive calendar days with at least one logged expense.
 * If today has no expense yet, yesterday still counts so a morning open
 * does not reset the streak before the user logs.
 */
export function computeExpenseStreak(
  expenses: Expense[],
  todayKey: string
): number {
  if (expenses.length === 0 || !isValidDateKey(todayKey)) return 0;

  const datesWithExpenses = collectExpenseDateKeys(expenses);
  if (datesWithExpenses.size === 0) return 0;

  const yesterdayKey = shiftDateKey(todayKey, -1);
  let cursor = todayKey;
  if (!datesWithExpenses.has(todayKey) && datesWithExpenses.has(yesterdayKey)) {
    cursor = yesterdayKey;
  }

  let streak = 0;
  while (datesWithExpenses.has(cursor)) {
    streak++;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

/** Longest consecutive run of expense-logged days in the full history. */
export function computeLongestExpenseStreak(expenses: Expense[]): number {
  const dates = Array.from(collectExpenseDateKeys(expenses)).sort();
  if (dates.length === 0) return 0;

  let longest = 1;
  let current = 1;
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] === shiftDateKey(dates[i - 1], 1)) {
      current++;
      if (current > longest) longest = current;
    } else {
      current = 1;
    }
  }
  return longest;
}

function withStreakBadge(badges: string[] | undefined, currentStreak: number): string[] {
  const next = badges ? [...badges] : [];
  if (currentStreak >= 7 && !next.includes(BADGES.STREAK_7.id)) {
    next.push(BADGES.STREAK_7.id);
  }
  return next;
}

function badgesEqual(a: string[] | undefined, b: string[]): boolean {
  const left = a ?? [];
  if (left.length !== b.length) return false;
  const right = new Set(b);
  return left.every((id) => right.has(id));
}

export type LoggingStreakUpdate = {
  next: UserStats;
  shouldPersist: boolean;
  persistPatch: Pick<
    UserStats,
    "currentStreak" | "longestStreak" | "badges" | "lastLoginDate"
  >;
};

/**
 * Overlay expense-history streaks onto stored gamification stats.
 * Existing users with a stale `currentStreak: 0` get backfilled.
 */
export function buildLoggingStreakUpdate(
  stats: UserStats | null,
  expenses: Expense[],
  todayKey: string,
  base: UserStats
): LoggingStreakUpdate {
  const currentStreak = computeExpenseStreak(expenses, todayKey);
  const longestStreak = Math.max(
    stats?.longestStreak ?? 0,
    base.longestStreak ?? 0,
    computeLongestExpenseStreak(expenses),
    currentStreak
  );
  const badges = withStreakBadge(stats?.badges ?? base.badges, currentStreak);
  const next: UserStats = {
    ...base,
    ...stats,
    currentStreak,
    longestStreak,
    badges,
  };

  const shouldPersist =
    stats == null ||
    currentStreak !== stats.currentStreak ||
    longestStreak !== stats.longestStreak ||
    !badgesEqual(stats.badges, badges);

  if (shouldPersist) {
    next.lastLoginDate = todayKey;
  }

  return {
    next,
    shouldPersist,
    persistPatch: {
      currentStreak,
      longestStreak,
      badges: next.badges,
      lastLoginDate: next.lastLoginDate,
    },
  };
}
