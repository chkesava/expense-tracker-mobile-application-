import type { Expense } from "../types/expense";
import type { CategoryBudget } from "../types/expense";
import { groupByCategory, groupBySubcategory, groupSubcategoriesFor } from "./analytics";

type FocusLens = {
  id: string;
  label: string;
  category?: string;
  subcategory?: string;
  match?: (e: Expense) => boolean;
};

export const FOCUS_LENSES: FocusLens[] = [
  { id: "food", label: "Food", category: "Food" },
  { id: "transport", label: "Travel", category: "Travel" },
  { id: "health", label: "Health", category: "Health" },
  { id: "family", label: "Family", category: "Family" },
  { id: "investments", label: "Savings & EMI", category: "Savings & EMI" },
  {
    id: "subscriptions",
    label: "Subscriptions",
    match: (e: Expense) =>
      e.subcategory === "OTT / Music" ||
      e.subcategory === "Subscriptions" ||
      (e.category === "Entertainment" && e.subcategory === "OTT / Music"),
  },
];

export type FocusLensId = string;

export function filterByLens(expenses: Expense[], lensId: FocusLensId): Expense[] {
  const lens = FOCUS_LENSES.find((l) => l.id === lensId);
  if (!lens) return expenses;
  if (lens.match) return expenses.filter(lens.match);
  if (lens.subcategory) {
    return expenses.filter(
      (e) => e.category === lens.category && e.subcategory === lens.subcategory
    );
  }
  if (lens.category) {
    return expenses.filter((e) => e.category === lens.category);
  }
  return expenses;
}

export function getTopCategories(expenses: Expense[], limit = 5) {
  return groupByCategory(expenses)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function getTopSubcategories(expenses: Expense[], limit = 8) {
  return groupBySubcategory(expenses).slice(0, limit);
}

export type BudgetActualRow = {
  key: string;
  category: string;
  subcategory?: string;
  budget: number;
  actual: number;
  remaining: number;
  pct: number;
};

export function getBudgetVsActual(
  expenses: Expense[],
  budgets: CategoryBudget[],
  month: string
): BudgetActualRow[] {
  const monthBudgets = budgets.filter((b) => b.month === month);
  const monthExpenses = expenses.filter((e) => e.month === month);

  return monthBudgets.map((b) => {
    const actual = monthExpenses
      .filter((e) => {
        if (e.category !== b.category) return false;
        if (b.subcategory) return e.subcategory === b.subcategory;
        return true;
      })
      .reduce((sum, e) => sum + e.amount, 0);

    const remaining = b.amount - actual;
    const pct = b.amount > 0 ? Math.round((actual / b.amount) * 100) : 0;
    return {
      key: b.id,
      category: b.category,
      subcategory: b.subcategory,
      budget: b.amount,
      actual,
      remaining,
      pct,
    };
  });
}

export function getLensSummary(expenses: Expense[], lensId: FocusLensId) {
  const filtered = filterByLens(expenses, lensId);
  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const lens = FOCUS_LENSES.find((l) => l.id === lensId);
  const categoryName = lens?.category;
  const subs = categoryName
    ? groupSubcategoriesFor(filtered, categoryName)
    : groupBySubcategory(filtered).map((r) => ({
        subcategory: r.category.includes(" › ")
          ? r.category.split(" › ")[1]
          : r.category,
        value: r.value,
      }));

  return { total, count: filtered.length, subs, expenses: filtered };
}
