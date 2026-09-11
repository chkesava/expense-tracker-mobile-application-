/**
 * Single budget calculation for the Spendly dashboard (KAN-62).
 * Widgets must not invent a second remaining / pace / status story.
 */

import { shiftMonthKey } from "@/shared/utils/dates";

export type SpendlyBudgetStatus = "healthy" | "watch" | "attention";

export type SpendlyBudgetInput = {
  monthlyBudget: number;
  spent: number;
  /** YYYY-MM */
  monthKey: string;
  /** Day of month 1–31 (caller supplies so tests stay deterministic). */
  todayDay: number;
  /** Recurring amounts still due later this month. */
  remainingCommitted?: number;
};

export type SpendlyBudget = {
  spent: number;
  remaining: number;
  pctUsed: number;
  daysInMonth: number;
  daysElapsed: number;
  daysLeft: number;
  averageDailySpend: number;
  projectedMonthEnd: number;
  requiredDailyLimit: number;
  committedMonthly: number;
  flexibleRemaining: number;
  safeToSpendDaily: number;
  status: SpendlyBudgetStatus;
  isOverBudget: boolean;
  isOverPace: boolean;
};

export function daysInMonthOf(monthKey: string): number {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr) || new Date().getFullYear();
  const month = Number(monthStr) || new Date().getMonth() + 1;
  return new Date(year, month, 0).getDate();
}

export function computeSpendlyBudget(input: SpendlyBudgetInput): SpendlyBudget {
  const monthlyBudget = Math.max(0, Number(input.monthlyBudget) || 0);
  const spent = Math.max(0, Number(input.spent) || 0);
  const committedMonthly = Math.max(0, Number(input.remainingCommitted) || 0);
  const daysInMonth = daysInMonthOf(input.monthKey);
  const daysElapsed = Math.min(daysInMonth, Math.max(1, Math.floor(input.todayDay) || 1));
  const daysLeft = Math.max(0, daysInMonth - daysElapsed);

  const remaining = monthlyBudget - spent;
  const pctUsed = monthlyBudget > 0 ? Math.round((spent / monthlyBudget) * 100) : 0;
  const averageDailySpend = spent / daysElapsed;
  const projectedMonthEnd = averageDailySpend * daysInMonth;
  const isOverBudget = monthlyBudget > 0 && spent > monthlyBudget;
  const isOverPace = monthlyBudget > 0 && projectedMonthEnd > monthlyBudget;

  const flexibleRemaining = Math.max(0, remaining - committedMonthly);
  const safeToSpendDaily =
    flexibleRemaining <= 0 ? 0 : flexibleRemaining / Math.max(daysLeft, 1);
  const requiredDailyLimit = daysLeft > 0 ? Math.max(0, remaining) / daysLeft : 0;

  let status: SpendlyBudgetStatus = "healthy";
  if (monthlyBudget > 0) {
    if (isOverBudget || isOverPace) status = "attention";
    else if (pctUsed >= 80) status = "watch";
  }

  return {
    spent,
    remaining,
    pctUsed,
    daysInMonth,
    daysElapsed,
    daysLeft,
    averageDailySpend,
    projectedMonthEnd,
    requiredDailyLimit,
    committedMonthly,
    flexibleRemaining,
    safeToSpendDaily,
    status,
    isOverBudget,
    isOverPace,
  };
}

export function budgetStatusMessage(budget: SpendlyBudget): string {
  if (budget.status === "attention") {
    return budget.isOverBudget
      ? "Over budget — slow new spending."
      : "Current pace exceeds the monthly plan.";
  }
  if (budget.status === "watch") {
    return "Most of the monthly budget is already used.";
  }
  return "On track for this month.";
}

export type MonthCashFlow = {
  month: string;
  income: number;
  spent: number;
  net: number;
};

function monthOf(row: { month?: string; date?: string }): string {
  if (row.month && row.month.length >= 7) return row.month.slice(0, 7);
  if (row.date && row.date.length >= 7) return row.date.slice(0, 7);
  return "";
}

/** Last N calendar months of income − spend. Not historical net worth. */
export function cashFlowByMonth(
  expenses: Array<{ amount?: number; month?: string; date?: string }>,
  incomes: Array<{ amount?: number; month?: string; date?: string }>,
  endMonth: string,
  count = 6
): MonthCashFlow[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    keys.push(shiftMonthKey(endMonth, -i));
  }
  const spent = new Map<string, number>();
  const income = new Map<string, number>();
  for (const key of keys) {
    spent.set(key, 0);
    income.set(key, 0);
  }
  for (const row of expenses) {
    const key = monthOf(row);
    if (!spent.has(key)) continue;
    spent.set(key, (spent.get(key) || 0) + (row.amount || 0));
  }
  for (const row of incomes) {
    const key = monthOf(row);
    if (!income.has(key)) continue;
    income.set(key, (income.get(key) || 0) + (row.amount || 0));
  }
  return keys.map((month) => {
    const monthIncome = income.get(month) || 0;
    const monthSpent = spent.get(month) || 0;
    return { month, income: monthIncome, spent: monthSpent, net: monthIncome - monthSpent };
  });
}

export type UpcomingDueKind = "subscription" | "card" | "borrowing";

export type UpcomingDueItem = {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  daysRemaining: number;
  kind: UpcomingDueKind;
};

function parseDateKey(value: string): number | null {
  if (!value || value.length < 10) return null;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d);
}

export function daysUntil(dueDate: string, today: string): number {
  const due = parseDateKey(dueDate);
  const now = parseDateKey(today);
  if (due == null || now == null) return Number.POSITIVE_INFINITY;
  return Math.round((due - now) / (1000 * 60 * 60 * 24));
}

/** Amounts due on or after today that still fall in this month. */
export function remainingCommittedThisMonth(
  items: Array<{ amount?: number; dueDate?: string | null }>,
  monthKey: string,
  today: string
): number {
  let total = 0;
  for (const item of items) {
    const due = item.dueDate?.slice(0, 10);
    if (!due || !due.startsWith(monthKey)) continue;
    if (due < today.slice(0, 10)) continue;
    total += item.amount || 0;
  }
  return total;
}

export function duesWithinDays(
  items: UpcomingDueItem[],
  withinDays: number
): UpcomingDueItem[] {
  return items
    .filter((item) => item.daysRemaining <= withinDays)
    .sort((a, b) => a.daysRemaining - b.daysRemaining || a.name.localeCompare(b.name));
}

export function amountDueWithinDays(items: UpcomingDueItem[], withinDays: number): number {
  return duesWithinDays(items, withinDays).reduce((sum, item) => sum + item.amount, 0);
}
