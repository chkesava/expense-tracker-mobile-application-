import type { Expense } from "../types/expense";
import { currentMonthKey } from "./dates";

export type WeeklySummary = {
  week: number;
  total: number;
};

export function getWeeklySummary(
  expenses: Expense[],
  month: string
): {
  weeks: WeeklySummary[];
  currentWeekAvg: number;
  currentWeek?: number;
  currentWeekDaysSoFar?: number;
} {
  const filtered = expenses.filter((e) => e.month === month);

  const weeksMap: Record<number, number> = {};

  filtered.forEach((e) => {
    const day = Number(e.date.slice(8, 10)); // DD
    const week = Math.ceil(day / 7);

    weeksMap[week] = (weeksMap[week] || 0) + e.amount;
  });

  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const maxWeek = Math.ceil(lastDay / 7);

  const weeks: WeeklySummary[] = [];
  for (let i = 1; i <= maxWeek; i++) {
    weeks.push({ week: i, total: weeksMap[i] || 0 });
  }

  const today = new Date();
  const isCurrentMonth = month === currentMonthKey();

  let currentWeekAvg = 0;
  let currentWeek: number | undefined = undefined;
  let currentWeekDaysSoFar: number | undefined = undefined;

  if (isCurrentMonth) {
    currentWeek = Math.ceil(today.getDate() / 7);
    const weekTotal = weeksMap[currentWeek] || 0;
    const weekStartDay = (currentWeek - 1) * 7 + 1;
    const daysSoFar = Math.max(1, today.getDate() - weekStartDay + 1);
    currentWeekDaysSoFar = daysSoFar;

    if (daysSoFar < 7) {
      currentWeekAvg = Math.round(weekTotal / daysSoFar);
    } else {
      currentWeekAvg = Math.round(weekTotal / 7);
    }
  }

  return { weeks, currentWeekAvg, currentWeek, currentWeekDaysSoFar };
}
