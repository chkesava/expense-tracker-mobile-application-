import type { Expense } from "../types/expense";

export function groupByDay(expenses: Expense[]) {
  const map: Record<string, number> = {};

  for (const e of expenses) {
    map[e.date] = (map[e.date] || 0) + e.amount;
  }

  // Convert to chart-friendly array
  return Object.keys(map)
    .sort() // important: chronological order
    .map(date => ({
      date,
      value: map[date],
    }));
}
