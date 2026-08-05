import type { DashboardWidgets, UserSettings } from "@/shared/types/settings";
import type { Expense } from "@/shared/types/expense";

export type DashboardWidgetId =
  | "focus"
  | "gamification"
  | "subscriptions"
  | "topCategories"
  | "overview"
  | "investments"
  | "quickAdd"
  | "insight"
  | "budgetAlerts"
  | "financialGoals"
  | "recentActivity";

export const KNOWN_DASHBOARD_WIDGETS: readonly DashboardWidgetId[] = [
  "focus",
  "gamification",
  "subscriptions",
  "topCategories",
  "overview",
  "investments",
  "quickAdd",
  "insight",
  "budgetAlerts",
  "financialGoals",
  "recentActivity",
] as const;

const KNOWN_WIDGETS_SET = new Set<string>(KNOWN_DASHBOARD_WIDGETS);

/**
 * Resolves the ordered, filtered list of widget IDs to render on the dashboard
 * based on user settings, visibility toggles, and feature flags.
 */
export function getOrderedDashboardWidgets(
  order: string[] | undefined,
  widgetsConfig: DashboardWidgets | undefined,
  enableInvestments: boolean
): DashboardWidgetId[] {
  const sourceOrder = order && order.length > 0 ? order : KNOWN_DASHBOARD_WIDGETS;
  const seen = new Set<DashboardWidgetId>();
  const result: DashboardWidgetId[] = [];

  for (const rawId of sourceOrder) {
    if (!KNOWN_WIDGETS_SET.has(rawId)) continue;
    const id = rawId as DashboardWidgetId;
    if (seen.has(id)) continue;

    // Feature flag for investments
    if (id === "investments" && !enableInvestments) {
      continue;
    }

    // Toggleable widgets check
    if (widgetsConfig) {
      if (id === "subscriptions" && widgetsConfig.subscriptions === false) {
        continue;
      }
      if (id === "focus" && widgetsConfig.focus === false) {
        continue;
      }
      if (id === "gamification" && widgetsConfig.gamification === false) {
        continue;
      }
      if (id === "topCategories" && widgetsConfig.topCategories === false) {
        continue;
      }
    }

    seen.add(id);
    result.push(id);
  }

  return result;
}

export interface CategorySpendSummary {
  category: string;
  amount: number;
  percentage: number;
}

/**
 * Computes top spending categories sorted descending by amount.
 */
export function computeTopCategories(
  expenses: Expense[],
  limit = 5
): { categories: CategorySpendSummary[]; totalSpent: number } {
  const totals = new Map<string, number>();
  let totalSpent = 0;

  for (const exp of expenses) {
    const amount = exp.amount || 0;
    if (amount <= 0) continue;
    const cat = exp.category || "Uncategorized";
    totals.set(cat, (totals.get(cat) || 0) + amount);
    totalSpent += amount;
  }

  const sorted = Array.from(totals.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: totalSpent > 0 ? Math.round((amount / totalSpent) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);

  return { categories: sorted, totalSpent };
}

export interface DailySpendingPace {
  daysInMonth: number;
  daysElapsed: number;
  daysRemaining: number;
  totalSpent: number;
  averageDailySpend: number;
  projectedMonthEnd: number;
  dailyBudgetPace: number;
  isOverPace: boolean;
}

/**
 * Computes daily spending burn pace and month-end projection.
 */
export function computeDailySpendingPace(
  expenses: Expense[],
  monthKey: string,
  monthlyBudget = 0
): DailySpendingPace {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const month = parseInt(monthStr, 10) || new Date().getMonth() + 1;

  const daysInMonth = new Date(year, month, 0).getDate();
  const now = new Date();
  const isCurrentMonth =
    now.getFullYear() === year && now.getMonth() + 1 === month;

  const daysElapsed = isCurrentMonth ? Math.max(1, now.getDate()) : daysInMonth;
  const daysRemaining = Math.max(0, daysInMonth - daysElapsed);

  const totalSpent = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const averageDailySpend = daysElapsed > 0 ? totalSpent / daysElapsed : 0;
  const projectedMonthEnd = averageDailySpend * daysInMonth;
  const dailyBudgetPace = monthlyBudget > 0 ? monthlyBudget / daysInMonth : 0;
  const isOverPace = monthlyBudget > 0 && projectedMonthEnd > monthlyBudget;

  return {
    daysInMonth,
    daysElapsed,
    daysRemaining,
    totalSpent,
    averageDailySpend,
    projectedMonthEnd,
    dailyBudgetPace,
    isOverPace,
  };
}

/**
 * Computes consecutive days with logged expenses up to today.
 */
export function computeExpenseStreak(
  expenses: Expense[],
  todayKey: string
): number {
  if (expenses.length === 0) return 0;

  const datesWithExpenses = new Set<string>();
  for (const e of expenses) {
    if (e.date) datesWithExpenses.add(e.date);
  }

  let streak = 0;
  const currentDate = new Date(todayKey);

  while (true) {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, "0");
    const day = String(currentDate.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;

    if (datesWithExpenses.has(dateStr)) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}
