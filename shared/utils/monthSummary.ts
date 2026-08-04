import type { Expense } from "../types/expense";

export function getMonthlySummary(expenses: Expense[]) {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  const byCategory: Record<string, number> = {};
  for (const e of expenses) {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  }

  return { total, byCategory };
}
