import { increment } from "firebase/firestore";
import { addCategoryDeltas, summaryMonthOf } from "@/shared/utils/dashboardSummaryKeys";

export type DashboardSummaryDelta = {
  expenseDelta?: number;
  incomeDelta?: number;
  categoryDeltas?: Record<string, number>;
  transactionCountDelta?: number;
};

type ExpenseLike = {
  amount: number;
  category?: string;
  subcategory?: string;
  month?: string;
  date?: string;
};

type IncomeLike = { amount: number; month?: string; date?: string };

export function buildDashboardSummaryOps(
  uid: string,
  month: string | undefined, // YYYY-MM
  delta: DashboardSummaryDelta
) {
  const ops: any[] = [];
  if (!uid || !month) return ops;

  const data: any = {};
  if (delta.expenseDelta) {
    data.totalExpenses = increment(delta.expenseDelta);
  }
  if (delta.incomeDelta) {
    data.totalIncome = increment(delta.incomeDelta);
  }
  if (delta.transactionCountDelta) {
    data.transactionCount = increment(delta.transactionCountDelta);
  }
  if (delta.categoryDeltas) {
    // A nested map, not `"categoryTotals.<key>"`: in set({merge:true}) a
    // dotted key is a literal top-level field name, so the old shape never
    // reached the map (SPENDLY-495). Merge deep-merges the nested map.
    const categoryTotals: Record<string, unknown> = {};
    for (const [key, catDelta] of Object.entries(delta.categoryDeltas)) {
      if (catDelta !== 0) categoryTotals[key] = increment(catDelta);
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
export function computeDashboardExpenseCreateOps(uid: string, row: ExpenseLike) {
  return buildDashboardSummaryOps(uid, summaryMonthOf(row), {
    expenseDelta: row.amount,
    transactionCountDelta: 1,
    categoryDeltas: addCategoryDeltas({}, row, row.amount),
  });
}

/** A new income: +amount to its month. */
export function computeDashboardIncomeCreateOps(uid: string, row: IncomeLike) {
  return buildDashboardSummaryOps(uid, summaryMonthOf(row), {
    incomeDelta: row.amount,
    transactionCountDelta: 1,
  });
}

export function computeDashboardExpenseUpdateOps(uid: string, before: ExpenseLike, after: ExpenseLike) {
  const ops: any[] = [];
  const beforeMonth = summaryMonthOf(before);
  const afterMonth = summaryMonthOf(after);
  if (beforeMonth === afterMonth) {
    // Remove the old row and add the new one, summing shared keys: an edit
    // inside one parent (Food/Veg → Food/Fruit) nets the parent to
    // after − before instead of overwriting it.
    const categoryDeltas = addCategoryDeltas({}, before, -before.amount);
    addCategoryDeltas(categoryDeltas, after, after.amount);
    ops.push(
      ...buildDashboardSummaryOps(uid, afterMonth, {
        expenseDelta: after.amount - before.amount,
        categoryDeltas,
        transactionCountDelta: 0,
      })
    );
  } else {
    ops.push(
      ...buildDashboardSummaryOps(uid, beforeMonth, {
        expenseDelta: -before.amount,
        categoryDeltas: addCategoryDeltas({}, before, -before.amount),
        transactionCountDelta: -1,
      })
    );
    ops.push(
      ...buildDashboardSummaryOps(uid, afterMonth, {
        expenseDelta: after.amount,
        categoryDeltas: addCategoryDeltas({}, after, after.amount),
        transactionCountDelta: 1,
      })
    );
  }
  return ops;
}

export function computeDashboardIncomeUpdateOps(uid: string, before: IncomeLike, after: IncomeLike) {
  const ops: any[] = [];
  const beforeMonth = summaryMonthOf(before);
  const afterMonth = summaryMonthOf(after);
  if (beforeMonth === afterMonth) {
    ops.push(
      ...buildDashboardSummaryOps(uid, afterMonth, {
        incomeDelta: after.amount - before.amount,
        transactionCountDelta: 0,
      })
    );
  } else {
    ops.push(...buildDashboardSummaryOps(uid, beforeMonth, { incomeDelta: -before.amount, transactionCountDelta: -1 }));
    ops.push(...buildDashboardSummaryOps(uid, afterMonth, { incomeDelta: after.amount, transactionCountDelta: 1 }));
  }
  return ops;
}

export function computeDashboardDeleteOps(uid: string, row: ExpenseLike, type: "expense" | "income") {
  if (type === "expense") {
    return buildDashboardSummaryOps(uid, summaryMonthOf(row), {
      expenseDelta: -row.amount,
      categoryDeltas: addCategoryDeltas({}, row, -row.amount),
      transactionCountDelta: -1,
    });
  }
  return buildDashboardSummaryOps(uid, summaryMonthOf(row), {
    incomeDelta: -row.amount,
    transactionCountDelta: -1,
  });
}

export function computeDashboardRestoreOps(uid: string, row: ExpenseLike, type: "expense" | "income") {
  if (type === "expense") {
    return computeDashboardExpenseCreateOps(uid, row);
  }
  return computeDashboardIncomeCreateOps(uid, row);
}
