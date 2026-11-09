import { increment, serverTimestamp } from "@/lib/firestore";
import {
  buildDashboardSummaryOpsWith,
  type DashboardSummaryDelta,
  type ExpenseLike,
  type IncomeLike,
} from "@/shared/utils/dashboardMutationsCore";
import { addCategoryDeltas, summaryMonthOf } from "@/shared/utils/dashboardSummaryKeys";

export type { DashboardSummaryDelta } from "@/shared/utils/dashboardMutationsCore";

/** The app's builder: the client SDK's increment (logic in dashboardMutationsCore, SPENDLY-739). */
export function buildDashboardSummaryOps(uid: string, month: string | undefined, delta: DashboardSummaryDelta) {
  return buildDashboardSummaryOpsWith({ increment, serverTimestamp }, uid, month, delta);
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

export type DashboardRelabel = {
  amount: number;
  month?: string;
  date?: string;
  deletedAt?: unknown;
  before: { category?: string; subcategory?: string };
  after: { category?: string; subcategory?: string };
};

/**
 * SPENDLY-563 — dashboard ops for expenses whose category/subcategory was
 * rewritten in bulk (category rename or merge). Amounts and months do not
 * change, so each month only moves money between `categoryTotals` keys; the
 * deltas are summed so a chunk costs one op per month. Soft-deleted rows are
 * not counted by the summary, so they move nothing.
 */
export function dashboardOpsForRelabel(uid: string, rows: DashboardRelabel[]) {
  const byMonth = new Map<string, Record<string, number>>();
  for (const row of rows) {
    if (row.deletedAt) continue;
    const month = summaryMonthOf(row);
    const amount = Number(row.amount) || 0;
    if (!month || amount === 0) continue;
    const deltas = byMonth.get(month) ?? {};
    addCategoryDeltas(deltas, row.before, -amount);
    addCategoryDeltas(deltas, row.after, amount);
    byMonth.set(month, deltas);
  }
  return [...byMonth.entries()].flatMap(([month, categoryDeltas]) =>
    buildDashboardSummaryOps(uid, month, { categoryDeltas })
  );
}
