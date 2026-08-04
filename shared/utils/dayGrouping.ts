import type { Expense } from "../types/expense";
import { formatDateKey } from "./dates";

export type DayGroup = {
  today: Expense[];
  yesterday: Expense[];
  earlier: Expense[];
};

export function groupExpensesByDay(expenses: Expense[], timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone): DayGroup {
  const todayStr = formatDateKey(new Date(), timezone);

  const yDate = new Date();
  yDate.setDate(yDate.getDate() - 1);
  const yesterdayStr = formatDateKey(yDate, timezone);

  const groups: DayGroup = {
    today: [],
    yesterday: [],
    earlier: [],
  };

  expenses.forEach((expense) => {
    if (expense.date === todayStr) {
      groups.today.push(expense);
    } else if (expense.date === yesterdayStr) {
      groups.yesterday.push(expense);
    } else {
      groups.earlier.push(expense);
    }
  });

  return groups;
}
