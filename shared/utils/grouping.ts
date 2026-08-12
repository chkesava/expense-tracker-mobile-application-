import type { Expense } from "../types/expense";
import { todayDateKey, toLocalDateKey } from "./dates";

export function groupByDay(expenses: Expense[]) {
  const today = todayDateKey();
  const yesterday = toLocalDateKey(new Date(Date.now() - 86400000));

  return {
    today: expenses.filter((e) => e.date === today),
    yesterday: expenses.filter((e) => e.date === yesterday),
    earlier: expenses.filter((e) => e.date !== today && e.date !== yesterday),
  };
}
