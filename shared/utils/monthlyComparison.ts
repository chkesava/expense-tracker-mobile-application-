import type { Expense } from "../types/expense";

function getPreviousMonth(month: string): string {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const m = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(m) || m < 1 || m > 12) {
    return month;
  }
  const d = new Date(year, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function getMonthlyTotals(expenses: Expense[]) {
  const totals: Record<string, number> = {};

  expenses.forEach((e) => {
    totals[e.month] = (totals[e.month] || 0) + e.amount;
  });

  return totals;
}

export function compareCurrentWithPrevious(expenses: Expense[], selectedMonth?: string) {
  const totals = getMonthlyTotals(expenses);
  const months = Object.keys(totals).sort().reverse();

  if (!months.length) return null;

  const currentMonth = selectedMonth || months[0];
  const previousMonth = getPreviousMonth(currentMonth);

  const currentTotal = totals[currentMonth] ?? 0;
  const previousTotal = totals[previousMonth] ?? 0;

  const diff = currentTotal - previousTotal;
  const percent =
    previousTotal === 0 ? null : Math.round((diff / previousTotal) * 100);

  return {
    currentMonth,
    previousMonth,
    currentTotal,
    previousTotal,
    diff,
    percent,
  };
}
