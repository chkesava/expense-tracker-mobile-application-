import type { Expense } from "@/shared/types/expense";
import type { Trip, TripCategoryBudget } from "@/shared/types/trip";

/**
 * Sums all expenses linked to a specific trip.
 */
export function computeTripSpend(expenses: Expense[], tripId: string): number {
  return expenses.reduce((sum, e) => {
    if (e.tripId === tripId) return sum + (Number(e.amount) || 0);
    return sum;
  }, 0);
}

export interface TripCategoryBreakdown {
  category: string;
  spent: number;
  limit: number;
  percentage: number;
  isOverBudget: boolean;
}

/**
 * Returns per-category spend vs budget breakdown for a given trip.
 */
export function computeTripCategoryBreakdown(
  expenses: Expense[],
  trip: Trip
): TripCategoryBreakdown[] {
  const tripExpenses = expenses.filter((e) => e.tripId === trip.id);

  const spendByCategory = new Map<string, number>();
  for (const expense of tripExpenses) {
    const cat = expense.category || "Other";
    spendByCategory.set(cat, (spendByCategory.get(cat) || 0) + (Number(expense.amount) || 0));
  }

  const budgets = trip.categoryBudgets || [];
  const result: TripCategoryBreakdown[] = budgets.map((b) => {
    const spent = spendByCategory.get(b.category) || 0;
    const limit = b.limit || 0;
    const percentage = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
    return {
      category: b.category,
      spent,
      limit,
      percentage,
      isOverBudget: spent > limit && limit > 0,
    };
  });

  // Add categories with spending but no explicit budget
  for (const [category, spent] of spendByCategory.entries()) {
    const hasBudget = budgets.some((b) => b.category === category);
    if (!hasBudget) {
      result.push({
        category,
        spent,
        limit: 0,
        percentage: 0,
        isOverBudget: false,
      });
    }
  }

  return result.sort((a, b) => b.spent - a.spent);
}

export type TripDynamicStatus = "upcoming" | "active" | "completed";

/**
 * Returns dynamic trip status based on date comparison, irrespective of persisted status field.
 */
export function getTripStatus(trip: Trip, todayStr?: string): TripDynamicStatus {
  const today = todayStr || new Date().toISOString().split("T")[0];

  if (today < trip.startDate) return "upcoming";
  if (today > trip.endDate) return "completed";
  return "active";
}

/**
 * Checks if a trip has exceeded its total budget.
 */
export function isTripOverBudget(trip: Trip): boolean {
  return (trip.spentAmount || 0) > (trip.totalBudget || 0);
}

/**
 * Computes days remaining or days since completion for a trip.
 */
export function getTripDaysInfo(trip: Trip, todayStr?: string): {
  daysRemaining: number;
  totalDays: number;
  daysElapsed: number;
} {
  const today = todayStr || new Date().toISOString().split("T")[0];
  const start = new Date(trip.startDate);
  const end = new Date(trip.endDate);
  const todayDate = new Date(today);

  const totalMs = end.getTime() - start.getTime();
  const totalDays = Math.max(1, Math.ceil(totalMs / (1000 * 60 * 60 * 24)));

  const elapsedMs = todayDate.getTime() - start.getTime();
  const daysElapsed = Math.max(0, Math.ceil(elapsedMs / (1000 * 60 * 60 * 24)));

  const remainingMs = end.getTime() - todayDate.getTime();
  const daysRemaining = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));

  return { daysRemaining, totalDays, daysElapsed };
}

export interface TripAggregateSummary {
  activeCount: number;
  upcomingCount: number;
  completedCount: number;
  totalActiveSpend: number;
}

/**
 * Aggregates trip counts and total active spend across all trips.
 */
export function computeTripSummary(trips: Trip[], todayStr?: string): TripAggregateSummary {
  let activeCount = 0;
  let upcomingCount = 0;
  let completedCount = 0;
  let totalActiveSpend = 0;

  for (const trip of trips) {
    const status = getTripStatus(trip, todayStr);
    if (status === "active") {
      activeCount++;
      totalActiveSpend += trip.spentAmount || 0;
    } else if (status === "upcoming") {
      upcomingCount++;
    } else {
      completedCount++;
    }
  }

  return { activeCount, upcomingCount, completedCount, totalActiveSpend };
}

/** Default trip categories for budget allocation */
export const TRIP_BUDGET_CATEGORIES = [
  "Food",
  "Travel",
  "Accommodation",
  "Activities",
  "Shopping",
  "Other",
] as const;
