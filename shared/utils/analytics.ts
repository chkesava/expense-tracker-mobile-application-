import type { Expense } from "../types/expense";

export const groupByCategory = (expenses: Expense[]) => {
  const map: Record<string, number> = {};
  expenses.forEach(e => {
    map[e.category] = (map[e.category] || 0) + e.amount;
  });
  return Object.entries(map).map(([category, value]) => ({ category, value }));
};

export const groupBySubcategory = (expenses: Expense[]) => {
  const map: Record<string, number> = {};
  expenses.forEach((e) => {
    const key = e.subcategory
      ? `${e.category} › ${e.subcategory}`
      : e.category;
    map[key] = (map[key] || 0) + e.amount;
  });
  return Object.entries(map)
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value);
};

/** Subcategory totals within a single parent category. */
export const groupSubcategoriesFor = (expenses: Expense[], parentCategory: string) => {
  const map: Record<string, number> = {};
  expenses
    .filter((e) => e.category === parentCategory)
    .forEach((e) => {
      const key = e.subcategory || "Other";
      map[key] = (map[key] || 0) + e.amount;
    });
  return Object.entries(map)
    .map(([subcategory, value]) => ({ subcategory, value }))
    .sort((a, b) => b.value - a.value);
};

export const groupByMonth = (expenses: Expense[]) => {
  const map: Record<string, number> = {};
  expenses.forEach(e => {
    map[e.month] = (map[e.month] || 0) + e.amount;
  });
  return Object.entries(map).map(([month, value]) => ({ month, value }));
};

export const groupByAccount = (expenses: Expense[]) => {
  const map: Record<string, number> = {};
  expenses.forEach(e => {
    const key = e.accountId || "unknown";
    map[key] = (map[key] || 0) + e.amount;
  });
  return Object.entries(map).map(([accountId, value]) => ({ accountId, value }));
};
