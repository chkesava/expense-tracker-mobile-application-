import type { Income } from "../types/expense";
import { formatDateKey } from "./dates";

export const getIncomeSummary = (incomes: Income[]) => {
  const total = incomes.reduce((sum, i) => sum + i.amount, 0);
  const bySource = incomes.reduce((acc, i) => {
    acc[i.source] = (acc[i.source] || 0) + i.amount;
    return acc;
  }, {} as Record<string, number>);

  return { total, bySource };
};

export const groupIncomesByDay = (incomes: Income[], timezone: string = "UTC") => {
    const todayStr = formatDateKey(new Date(), timezone);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatDateKey(yesterday, timezone);

    return {
        today: incomes.filter(i => i.date === todayStr),
        yesterday: incomes.filter(i => i.date === yesterdayStr),
        earlier: incomes.filter(i => i.date !== todayStr && i.date !== yesterdayStr)
    };
};
