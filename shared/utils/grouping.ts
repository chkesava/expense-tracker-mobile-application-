import type { Expense } from "../types/expense";

export function groupByDay(expenses: Expense[]) {
  const today = new Date().toISOString().slice(0,10);
  const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10);

  return {
    today: expenses.filter(e=>e.date===today),
    yesterday: expenses.filter(e=>e.date===yesterday),
    earlier: expenses.filter(e=>e.date!==today && e.date!==yesterday)
  };
}