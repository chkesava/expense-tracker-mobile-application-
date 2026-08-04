import type { Expense } from "../types/expense";

/**
 * Highest spending day (date + total)
 */
export function getHighestSpendingDay(expenses: Expense[]) {
  const totals: Record<string, number> = {};

  expenses.forEach((e) => {
    totals[e.date] = (totals[e.date] || 0) + e.amount;
  });

  let maxDate = "";
  let maxAmount = 0;

  for (const date in totals) {
    if (totals[date] > maxAmount) {
      maxAmount = totals[date];
      maxDate = date;
    }
  }

  return maxDate
    ? { date: maxDate, amount: maxAmount }
    : null;
}

/**
 * Top spending category
 */
export function getTopCategory(expenses: Expense[]) {
  const totals: Record<string, number> = {};

  expenses.forEach((e) => {
    totals[e.category] = (totals[e.category] || 0) + e.amount;
  });

  let topCategory = "";
  let maxAmount = 0;

  for (const category in totals) {
    if (totals[category] > maxAmount) {
      maxAmount = totals[category];
      topCategory = category;
    }
  }

  return topCategory
    ? { category: topCategory, amount: maxAmount }
    : null;
}

/**
 * Average daily spend
 */
export function getAverageDailySpend(expenses: Expense[]) {
  if (!expenses.length) return 0;

  const uniqueDays = new Set(expenses.map((e) => e.date)).size;
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return Math.round(total / uniqueDays);
}
