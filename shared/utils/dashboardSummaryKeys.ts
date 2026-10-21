import { monthKeyOf } from "./dates";

/**
 * SPENDLY-495 — the one key scheme for `categoryTotals`: every expense counts
 * under its parent category and, when it has one, under
 * `"category::subcategory"`. Parent keys alone partition the month's spend
 * (`topCategoryShares`); the `::` keys serve subcategory budgets
 * (`computeActiveCategoryBudgets`). Create, edit, delete, restore and the
 * rebuild (`calculateDashboardSummaries`) all use this.
 */
export function categoryKeysFor(category: string | undefined, subcategory: string | undefined): string[] {
  if (!category) return [];
  return subcategory ? [category, `${category}::${subcategory}`] : [category];
}

/** Adds `amount` to every key the row counts under, summing collisions. */
export function addCategoryDeltas(
  target: Record<string, number>,
  row: { category?: string; subcategory?: string },
  amount: number
): Record<string, number> {
  for (const key of categoryKeysFor(row.category, row.subcategory)) {
    target[key] = (target[key] ?? 0) + amount;
  }
  return target;
}

/** The period a ledger row is bucketed into: its `month`, else its date. */
export function summaryMonthOf(row: { month?: string; date?: string }): string | undefined {
  return monthKeyOf(row);
}
