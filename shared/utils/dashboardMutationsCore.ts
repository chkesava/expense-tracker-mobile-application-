/**
 * SPENDLY-739 — the dashboard summary op builder without a client SDK import:
 * the sentinels are passed in. `dashboardMutations.ts` binds the client's; a
 * server job binds the Admin SDK's.
 */
import type { FieldValueSentinels } from "./firestoreSentinels";
import { addCategoryDeltas, summaryMonthOf } from "./dashboardSummaryKeys";

export type DashboardSummaryDelta = {
  expenseDelta?: number;
  incomeDelta?: number;
  categoryDeltas?: Record<string, number>;
  transactionCountDelta?: number;
};

export type ExpenseLike = {
  amount: number;
  category?: string;
  subcategory?: string;
  month?: string;
  date?: string;
};

export type IncomeLike = { amount: number; month?: string; date?: string };

export function buildDashboardSummaryOpsWith(
  fv: FieldValueSentinels,
  uid: string,
  month: string | undefined, // YYYY-MM
  delta: DashboardSummaryDelta
) {
  const ops: any[] = [];
  if (!uid || !month) return ops;

  const data: any = {};
  if (delta.expenseDelta) {
    data.totalExpenses = fv.increment(delta.expenseDelta);
  }
  if (delta.incomeDelta) {
    data.totalIncome = fv.increment(delta.incomeDelta);
  }
  if (delta.transactionCountDelta) {
    data.transactionCount = fv.increment(delta.transactionCountDelta);
  }
  if (delta.categoryDeltas) {
    // A nested map, not `"categoryTotals.<key>"`: in set({merge:true}) a
    // dotted key is a literal top-level field name, so the old shape never
    // reached the map (SPENDLY-495). Merge deep-merges the nested map.
    const categoryTotals: Record<string, unknown> = {};
    for (const [key, catDelta] of Object.entries(delta.categoryDeltas)) {
      if (catDelta !== 0) categoryTotals[key] = fv.increment(catDelta);
    }
    if (Object.keys(categoryTotals).length > 0) data.categoryTotals = categoryTotals;
  }

  if (Object.keys(data).length > 0) {
    data.period = month;
    data.summaryVersion = 1;

    ops.push({
      op: "set",
      ref: { path: `users/${uid}/financialSummaries/dashboard_${month}` },
      data,
      merge: true,
    });
  }

  return ops;
}

/** A new expense: +amount to its month, parent and subcategory. */
export function computeDashboardExpenseCreateOpsWith(fv: FieldValueSentinels, uid: string, row: ExpenseLike) {
  return buildDashboardSummaryOpsWith(fv, uid, summaryMonthOf(row), {
    expenseDelta: row.amount,
    transactionCountDelta: 1,
    categoryDeltas: addCategoryDeltas({}, row, row.amount),
  });
}
