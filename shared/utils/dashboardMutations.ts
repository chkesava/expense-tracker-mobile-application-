import { doc, FieldValue, increment } from "firebase/firestore";
import type { DashboardPeriodSummary } from "@/shared/types/financialSummary";
import { withoutUndefined } from "@/shared/utils/objects";

export type DashboardSummaryDelta = {
  expenseDelta?: number;
  incomeDelta?: number;
  categoryDeltas?: Record<string, number>;
  transactionCountDelta?: number;
};

export function buildDashboardSummaryOps(
  uid: string,
  month: string, // YYYY-MM
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
    for (const [catId, catDelta] of Object.entries(delta.categoryDeltas)) {
      if (catDelta !== 0) {
        data[`categoryTotals.${catId}`] = increment(catDelta);
      }
    }
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

export function computeDashboardExpenseUpdateOps(uid: string, before: any, after: any) {
  const ops: any[] = [];
  if (before.month === after.month) {
    const expenseDelta = after.amount - before.amount;
    let categoryDeltas: Record<string, number> = {};
    if (before.category === after.category && before.subcategory === after.subcategory) {
      if (expenseDelta !== 0) {
        categoryDeltas[after.category] = expenseDelta;
        if (after.subcategory) {
          categoryDeltas[`${after.category}::${after.subcategory}`] = expenseDelta;
        }
      }
    } else {
      categoryDeltas[before.category] = -before.amount;
      if (before.subcategory) {
        categoryDeltas[`${before.category}::${before.subcategory}`] = -before.amount;
      }
      categoryDeltas[after.category] = after.amount;
      if (after.subcategory) {
        categoryDeltas[`${after.category}::${after.subcategory}`] = after.amount;
      }
    }
    ops.push(...buildDashboardSummaryOps(uid, after.month, { expenseDelta, categoryDeltas, transactionCountDelta: 0 }));
  } else {
    ops.push(...buildDashboardSummaryOps(uid, before.month, {
      expenseDelta: -before.amount,
      categoryDeltas: { 
        [before.category]: -before.amount,
        ...(before.subcategory ? { [`${before.category}::${before.subcategory}`]: -before.amount } : {})
      },
      transactionCountDelta: -1
    }));
    ops.push(...buildDashboardSummaryOps(uid, after.month, {
      expenseDelta: after.amount,
      categoryDeltas: { 
        [after.category]: after.amount,
        ...(after.subcategory ? { [`${after.category}::${after.subcategory}`]: after.amount } : {})
      },
      transactionCountDelta: 1
    }));
  }
  return ops;
}

export function computeDashboardIncomeUpdateOps(uid: string, before: any, after: any) {
  const ops: any[] = [];
  if (before.month === after.month) {
    const incomeDelta = after.amount - before.amount;
    ops.push(...buildDashboardSummaryOps(uid, after.month, { incomeDelta, transactionCountDelta: 0 }));
  } else {
    ops.push(...buildDashboardSummaryOps(uid, before.month, { incomeDelta: -before.amount, transactionCountDelta: -1 }));
    ops.push(...buildDashboardSummaryOps(uid, after.month, { incomeDelta: after.amount, transactionCountDelta: 1 }));
  }
  return ops;
}

export function computeDashboardDeleteOps(uid: string, row: any, type: "expense" | "income") {
  if (type === "expense") {
    return buildDashboardSummaryOps(uid, row.month, {
      expenseDelta: -row.amount,
      categoryDeltas: { 
        [row.category]: -row.amount,
        ...(row.subcategory ? { [`${row.category}::${row.subcategory}`]: -row.amount } : {})
      },
      transactionCountDelta: -1
    });
  } else {
    return buildDashboardSummaryOps(uid, row.month, {
      incomeDelta: -row.amount,
      transactionCountDelta: -1
    });
  }
}

export function computeDashboardRestoreOps(uid: string, row: any, type: "expense" | "income") {
  if (type === "expense") {
    return buildDashboardSummaryOps(uid, row.month, {
      expenseDelta: row.amount,
      categoryDeltas: { 
        [row.category]: row.amount,
        ...(row.subcategory ? { [`${row.category}::${row.subcategory}`]: row.amount } : {})
      },
      transactionCountDelta: 1
    });
  } else {
    return buildDashboardSummaryOps(uid, row.month, {
      incomeDelta: row.amount,
      transactionCountDelta: 1
    });
  }
}
