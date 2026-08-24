import type { Expense, Income } from "../types/expense";
import { currentMonthKey } from "./dates";

const FIXED_CATEGORIES = [
  "Home",
  "Housing",
  "Bills",
  "Savings & EMI",
  "Finance",
  "Rent",
  "Utilities",
  "Subscriptions",
  "Insurance",
  "EMI",
  "EMIS",
];

/**
 * Gets day details for the selected month.
 * If selectedMonth is the current calendar month, it returns today's day of the month.
 * Otherwise, it returns the total number of days (the month has fully elapsed).
 */
export function getMonthDayProgress(selectedMonth: string) {
  const today = new Date();
  const currentMonthStr = currentMonthKey();
  
  const [year, month] = selectedMonth.split("-").map(Number);
  const totalDays = new Date(year, month, 0).getDate(); // Last day of month
  
  const isCurrentMonth = selectedMonth === currentMonthStr;
  const dayOfMonth = isCurrentMonth ? Math.min(today.getDate(), totalDays) : totalDays;
  
  return {
    dayOfMonth,
    totalDays,
    isCurrentMonth,
  };
}

/**
 * Calculates month-to-date (MTD) and projected spending metrics compared to historical averages.
 */
export function getPacingMetrics(expenses: Expense[], selectedMonth: string) {
  const { dayOfMonth, totalDays } = getMonthDayProgress(selectedMonth);

  // Current month MTD spending
  const currentMonthExpenses = expenses.filter((e) => e.month === selectedMonth);
  const currentMonthTotal = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);
  
  const currentMonthMtdTotal = currentMonthExpenses
    .filter((e) => {
      const eDay = new Date(e.date).getDate();
      return eDay <= dayOfMonth;
    })
    .reduce((sum, e) => sum + e.amount, 0);

  // Group historic expenses by month (excluding current selectedMonth)
  const otherMonths = Array.from(new Set(expenses.map((e) => e.month)))
    .filter((m) => m !== selectedMonth);

  let totalHistoricMtd = 0;
  let totalHistoricMonth = 0;
  let historicMonthCount = 0;

  otherMonths.forEach((m) => {
    const monthExps = expenses.filter((e) => e.month === m);
    const monthTotal = monthExps.reduce((sum, e) => sum + e.amount, 0);
    const monthMtdTotal = monthExps
      .filter((e) => {
        const eDay = new Date(e.date).getDate();
        return eDay <= dayOfMonth;
      })
      .reduce((sum, e) => sum + e.amount, 0);

    totalHistoricMtd += monthMtdTotal;
    totalHistoricMonth += monthTotal;
    historicMonthCount += 1;
  });

  const historicAverageMtdTotal = historicMonthCount > 0 ? totalHistoricMtd / historicMonthCount : currentMonthMtdTotal * 0.9; // fallback if no historic data
  const historicAverageMonthlyTotal = historicMonthCount > 0 ? totalHistoricMonth / historicMonthCount : currentMonthTotal * 0.9;

  // Pacing status: how much over/under historic average MTD spend we are
  const diffFromAvgMtd = currentMonthMtdTotal - historicAverageMtdTotal;
  const pacingPercentage = historicAverageMtdTotal > 0 ? (diffFromAvgMtd / historicAverageMtdTotal) * 100 : 0;

  // Projected EOM spending based on current MTD run-rate
  const projectedEndMonthTotal = dayOfMonth > 0 ? (currentMonthMtdTotal / dayOfMonth) * totalDays : currentMonthTotal;

  return {
    currentMonthTotal,
    currentMonthMtdTotal,
    historicAverageMonthlyTotal,
    historicAverageMtdTotal,
    dayOfMonth,
    totalDays,
    pacingPercentage,
    projectedEndMonthTotal,
  };
}

/**
 * Calculates Net Cash Flow and Savings Rate.
 */
export function getCashFlowMetrics(incomes: Income[], expenses: Expense[], selectedMonth: string) {
  const totalIncome = incomes
    .filter((i) => i.month === selectedMonth)
    .reduce((sum, i) => sum + i.amount, 0);

  const totalExpense = expenses
    .filter((e) => e.month === selectedMonth)
    .reduce((sum, e) => sum + e.amount, 0);

  const netCashFlow = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? (netCashFlow / totalIncome) * 100 : 0;

  return {
    totalIncome,
    totalExpense,
    netCashFlow,
    savingsRate,
  };
}

/**
 * Calculates Fixed expenses (Rent, Utilities, Subscriptions, Insurance, EMIS, or marked as isRecurring)
 * vs Discretionary/Variable expenses.
 */
export function getFixedVsVariableMetrics(expenses: Expense[], selectedMonth: string) {
  const currentMonthExpenses = expenses.filter((e) => e.month === selectedMonth);

  let fixedTotal = 0;
  let variableTotal = 0;

  currentMonthExpenses.forEach((e) => {
    const isFixedCategory = FIXED_CATEGORIES.some(
      (cat) => cat.toLowerCase() === e.category?.toLowerCase()
    );
    if (isFixedCategory || e.isRecurring) {
      fixedTotal += e.amount;
    } else {
      variableTotal += e.amount;
    }
  });

  const total = fixedTotal + variableTotal;
  const fixedPercentage = total > 0 ? (fixedTotal / total) * 100 : 0;
  const variablePercentage = total > 0 ? (variableTotal / total) * 100 : 0;

  return {
    fixedTotal,
    variableTotal,
    fixedPercentage,
    variablePercentage,
  };
}

/**
 * Detects spending anomalies (spikes) by comparing category spending to historical averages.
 * Also returns the single largest transaction of the month.
 */
export function getAnomalyMetrics(expenses: Expense[], selectedMonth: string) {
  const currentMonthExpenses = expenses.filter((e) => e.month === selectedMonth);

  // Group historic expenses by category and month
  const otherMonths = Array.from(new Set(expenses.map((e) => e.month)))
    .filter((m) => m !== selectedMonth);

  const categoryHistoricTotals: Record<string, Record<string, number>> = {};
  expenses
    .filter((e) => otherMonths.includes(e.month))
    .forEach((e) => {
      if (!categoryHistoricTotals[e.category]) {
        categoryHistoricTotals[e.category] = {};
      }
      categoryHistoricTotals[e.category][e.month] = (categoryHistoricTotals[e.category][e.month] || 0) + e.amount;
    });

  // Calculate historic category averages
  const categoryHistoricAverages: Record<string, number> = {};
  Object.keys(categoryHistoricTotals).forEach((cat) => {
    const monthsData = categoryHistoricTotals[cat];
    const total = Object.values(monthsData).reduce((sum, val) => sum + val, 0);
    categoryHistoricAverages[cat] = otherMonths.length > 0 ? total / otherMonths.length : 0;
  });

  // Calculate current month category spending
  const currentCategoryTotals: Record<string, number> = {};
  currentMonthExpenses.forEach((e) => {
    currentCategoryTotals[e.category] = (currentCategoryTotals[e.category] || 0) + e.amount;
  });

  // Detect spikes (>30% increase vs historic average, with minimum historic average of ₹200 to avoid tiny noise)
  const anomalies: { category: string; currentSpend: number; historicAverage: number; percentIncrease: number }[] = [];
  
  Object.keys(currentCategoryTotals).forEach((cat) => {
    const currentSpend = currentCategoryTotals[cat];
    const historicAverage = categoryHistoricAverages[cat] || 0;

    if (historicAverage > 200) {
      const increase = currentSpend - historicAverage;
      const percentIncrease = (increase / historicAverage) * 100;
      if (percentIncrease >= 30) {
        anomalies.push({
          category: cat,
          currentSpend,
          historicAverage,
          percentIncrease,
        });
      }
    }
  });

  const largestTransaction = currentMonthExpenses.reduce<Expense | null>(
    (largest, e) => (!largest || e.amount > largest.amount ? e : largest),
    null
  );

  return {
    anomalies: anomalies.sort((a, b) => b.percentIncrease - a.percentIncrease),
    largestTransaction,
  };
}
