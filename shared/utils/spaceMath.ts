/**
 * Pure Spending Space math: totals, budget progress and category breakdown.
 *
 * A Space never owns money of its own. Every number here is derived by
 * filtering existing expenses on `spaceId`, so removing a Space from an
 * expense simply removes it from these totals.
 */

import type { Expense } from "../types/expense";
import type { Space } from "../types/space";

/** Informational only. Nothing in the app blocks spending over budget. */
export type BudgetProgressTier = "none" | "safe" | "warning" | "danger" | "over";

export const BUDGET_WARNING_PERCENT = 75;
export const BUDGET_DANGER_PERCENT = 90;

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Expenses assigned to a Space. Unassigned expenses are always excluded. */
export function expensesInSpace(
  expenses: Expense[],
  spaceId: string
): Expense[] {
  if (!spaceId) return [];
  return expenses.filter((expense) => expense.spaceId === spaceId);
}

export function budgetProgressTier(
  percentUsed: number,
  hasBudget: boolean
): BudgetProgressTier {
  if (!hasBudget) return "none";
  if (percentUsed >= 100) return "over";
  if (percentUsed >= BUDGET_DANGER_PERCENT) return "danger";
  if (percentUsed >= BUDGET_WARNING_PERCENT) return "warning";
  return "safe";
}

export interface SpaceSummary {
  spaceId: string;
  totalSpent: number;
  expenseCount: number;
  hasBudget: boolean;
  budget: number;
  /** Can go negative once the Space is over budget. */
  budgetRemaining: number;
  percentUsed: number;
  tier: BudgetProgressTier;
  firstExpenseDate: string | null;
  lastExpenseDate: string | null;
}

export function summarizeSpace(
  space: Space,
  expenses: Expense[]
): SpaceSummary {
  const spaceId = space.id ?? "";
  const assigned = expensesInSpace(expenses, spaceId);

  const totalSpent = roundMoney(
    assigned.reduce((sum, expense) => sum + (expense.amount || 0), 0)
  );

  const budget = space.budget ?? 0;
  const hasBudget = Number.isFinite(budget) && budget > 0;
  const percentUsed = hasBudget
    ? roundMoney((totalSpent / budget) * 100)
    : 0;

  const dates = assigned
    .map((expense) => expense.date)
    .filter(Boolean)
    .sort();

  return {
    spaceId,
    totalSpent,
    expenseCount: assigned.length,
    hasBudget,
    budget: hasBudget ? budget : 0,
    budgetRemaining: hasBudget ? roundMoney(budget - totalSpent) : 0,
    percentUsed,
    tier: budgetProgressTier(percentUsed, hasBudget),
    firstExpenseDate: dates[0] ?? null,
    lastExpenseDate: dates[dates.length - 1] ?? null,
  };
}

export interface SpaceCategorySlice {
  category: string;
  total: number;
  count: number;
  /** Share of the Space total, 0 when the Space has no spend. */
  percentage: number;
}

/** Category totals for a set of expenses, largest first. */
export function buildSpaceCategoryBreakdown(
  expenses: Expense[]
): SpaceCategorySlice[] {
  const totals = new Map<string, { total: number; count: number }>();

  for (const expense of expenses) {
    const category = expense.category || "Uncategorized";
    const current = totals.get(category) ?? { total: 0, count: 0 };
    current.total += expense.amount || 0;
    current.count += 1;
    totals.set(category, current);
  }

  const grandTotal = Array.from(totals.values()).reduce(
    (sum, entry) => sum + entry.total,
    0
  );

  return Array.from(totals.entries())
    .map(([category, entry]) => ({
      category,
      total: roundMoney(entry.total),
      count: entry.count,
      percentage:
        grandTotal > 0 ? roundMoney((entry.total / grandTotal) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
}

export interface SpacesPortfolioSummary {
  totalSpent: number;
  totalBudget: number;
  spaceCount: number;
  overBudgetCount: number;
  unassignedExpenseCount: number;
}

/** Totals across every Space, plus how many expenses have no Space at all. */
export function summarizeSpaces(
  spaces: Space[],
  expenses: Expense[]
): SpacesPortfolioSummary {
  let totalSpent = 0;
  let totalBudget = 0;
  let overBudgetCount = 0;

  for (const space of spaces) {
    const summary = summarizeSpace(space, expenses);
    totalSpent += summary.totalSpent;
    totalBudget += summary.budget;
    if (summary.tier === "over") overBudgetCount += 1;
  }

  return {
    totalSpent: roundMoney(totalSpent),
    totalBudget: roundMoney(totalBudget),
    spaceCount: spaces.length,
    overBudgetCount,
    unassignedExpenseCount: expenses.filter((expense) => !expense.spaceId)
      .length,
  };
}
