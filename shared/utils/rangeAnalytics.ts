import type { Expense, CategoryBudget } from "../types/expense";
import { parseLocalDate, toLocalDateKey, daysInMonth } from "./dates";

export interface TimeSeriesPoint {
  date: string;
  amount: number;
}

/**
 * Generates a full time series for a date range, filling in gaps with 0
 */
export const getDailySpendingSeries = (expenses: Expense[], start: string, end: string): TimeSeriesPoint[] => {
  const dailyMap: Record<string, number> = {};
  
  // Initialize map with all dates in range
  const startDate = parseLocalDate(start);
  const endDate = parseLocalDate(end);
  const current = new Date(startDate);

  while (current <= endDate) {
    const dStr = toLocalDateKey(current);
    dailyMap[dStr] = 0;
    current.setDate(current.getDate() + 1);
  }

  // Populate with actual expense data
  expenses.forEach(e => {
    if (dailyMap[e.date] !== undefined) {
      dailyMap[e.date] += e.amount;
    }
  });

  return Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount }));
};

/**
 * Calculates spending split between weekdays and weekends
 */
export const getWeekendVsWeekdaySplit = (expenses: Expense[]) => {
  let weekend = 0;
  let weekday = 0;

  expenses.forEach(e => {
    const d = new Date(e.date);
    const day = d.getDay();
    const isWeekend = day === 0 || day === 6; // Sunday or Saturday
    if (isWeekend) weekend += e.amount;
    else weekday += e.amount;
  });

  return { weekend, weekday };
};

/**
 * Groups expenses by note/vendor to find frequency
 */
export const getTopVendors = (expenses: Expense[]) => {
  const map: Record<string, { count: number; total: number }> = {};
  
  expenses.forEach(e => {
    const note = e.note?.trim() || "No Note";
    if (!map[note]) map[note] = { count: 0, total: 0 };
    map[note].count += 1;
    map[note].total += e.amount;
  });

  return Object.entries(map)
    .map(([note, stats]) => ({ note, ...stats }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
};

/**
 * Identifies expenses that are 2x higher than the average for the range
 */
export const getAnomalies = (expenses: Expense[]) => {
  if (expenses.length === 0) return [];
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  const avg = total / expenses.length;
  
  return expenses
    .filter(e => e.amount > avg * 2)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
};

/**
 * Groups expenses by day of week
 */
export const getDayOfWeekDistribution = (expenses: Expense[]) => {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const map: Record<string, number> = {};
  days.forEach(d => map[d] = 0);

  expenses.forEach(e => {
    const d = new Date(e.date);
    const dayName = days[d.getDay()];
    map[dayName] += e.amount;
  });

  return Object.entries(map).map(([name, amount]) => ({ name, amount }));
};

/**
 * Calculates cumulative spending over time for the range
 */
export const getCumulativeSpendingSeries = (expenses: Expense[], start: string, end: string) => {
  const daily = getDailySpendingSeries(expenses, start, end);
  let cumulative = 0;
  
  return daily.map(d => {
    cumulative += d.amount;
    return {
      ...d,
      cumulative
    };
  });
};

export interface BudgetForecast {
  category: string;
  budgetAmount: number;
  currentSpend: number;
  projectedSpend: number;
  overshootPercent: number;
  exceedDay: number;
}

/**
 * Predicts whether the user will overshoot their category budgets this month
 */
export const getBudgetForecasts = (
  currentMonthExpenses: Expense[],
  currentMonthBudgets: CategoryBudget[],
  todayStr: string
): BudgetForecast[] => {
  const [yearStr, monthStr, dayStr] = todayStr.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const currentDay = Number(dayStr);
  const totalDays = daysInMonth(year, monthIndex);
  
  const currentMonth = todayStr.slice(0, 7);

  // Group current month's expenses by category
  const spentByCategory: Record<string, number> = {};
  currentMonthExpenses.forEach(e => {
    spentByCategory[e.category] = (spentByCategory[e.category] || 0) + e.amount;
  });

  const forecasts: BudgetForecast[] = [];

  currentMonthBudgets.forEach(budget => {
    const currentSpend = spentByCategory[budget.category] || 0;
    const budgetAmount = budget.amount;

    if (budgetAmount <= 0) return;

    // Only forecast if they haven't already exceeded the budget
    if (currentSpend >= budgetAmount) return;

    const daysElapsed = Math.max(1, currentDay);
    const velocity = currentSpend / daysElapsed;

    if (velocity <= 0) return;

    const projectedSpend = velocity * totalDays;

    if (projectedSpend > budgetAmount) {
      const overshootPercent = Math.round(((projectedSpend - budgetAmount) / budgetAmount) * 100);
      const exceedDay = Math.ceil(budgetAmount / velocity);

      // Only show if they exceed it within this month
      if (exceedDay <= totalDays) {
        forecasts.push({
          category: budget.category,
          budgetAmount,
          currentSpend,
          projectedSpend,
          overshootPercent,
          exceedDay
        });
      }
    }
  });

  return forecasts;
};

