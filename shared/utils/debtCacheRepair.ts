/**
 * SPENDLY-605 — plans the repair of borrowing / receivable caches that
 * disagree with their repayment rows.
 *
 * Before the fix, a repayment dated after the provider's "today" was written
 * to history while its parent was stamped without it (₹0 received, the full
 * amount outstanding). The app now detects that drift and derives the summary
 * from the rows, but the stored fields (and the read-model copy synced from
 * them) stay stale until something restamps them. This is that restamp, for
 * the rebuild runner's dry-run / --apply.
 *
 * Only drifted parents are planned: the stored total paid/received differs
 * from the sum of its rows, or (interest-free only, whose cache cannot age)
 * the stored outstanding differs from principal minus principal repaid.
 * Unlike the in-app guard, the runner holds every row, so a parent with no
 * rows is judged against zero rather than skipped.
 */
import type { Borrowing, BorrowingRepayment } from "../types/borrowing";
import type { Receivable, ReceivableRepayment } from "../types/receivable";
import {
  borrowingCacheAsOfDate,
  borrowingCacheDrifted,
  borrowingRepaymentTotals,
  denormalizedBorrowingCacheFields,
  summarizeBorrowing,
} from "./borrowingMath";
import {
  denormalizedReceivableCacheFields,
  receivableCacheAsOfDate,
  receivableCacheDrifted,
  receivableRepaymentTotals,
  summarizeReceivable,
} from "./receivableMath";

export interface DebtCacheRepairPlan {
  kind: "borrowing" | "receivable";
  id: string;
  /** "field: stored → derived" for every cache field that changes. */
  variances: string[];
  next: Record<string, unknown>;
}

function diff(
  stored: Record<string, unknown>,
  next: Record<string, unknown>
): string[] {
  return Object.entries(next)
    .filter(([key, value]) => (stored[key] ?? null) !== (value ?? null))
    .map(
      ([key, value]) =>
        `${key}: ${JSON.stringify(stored[key] ?? null)} → ${JSON.stringify(value ?? null)}`
    );
}

export function planDebtCacheRepair(
  input: {
    borrowings: Borrowing[];
    borrowingRepayments: BorrowingRepayment[];
    receivables: Receivable[];
    receivableRepayments: ReceivableRepayment[];
  },
  today: string
): DebtCacheRepairPlan[] {
  const plans: DebtCacheRepairPlan[] = [];

  const rTotals = receivableRepaymentTotals(input.receivableRepayments);
  for (const receivable of input.receivables) {
    if (!receivable.id || receivable.totalReceived === undefined) continue;
    if (!rTotals.has(receivable.id)) {
      rTotals.set(receivable.id, { totalReceived: 0, principalReceived: 0 });
    }
    if (!receivableCacheDrifted(receivable, rTotals)) continue;
    const next = denormalizedReceivableCacheFields(
      summarizeReceivable(
        receivable,
        input.receivableRepayments,
        receivableCacheAsOfDate(receivable.id, input.receivableRepayments, today)
      )
    );
    plans.push({
      kind: "receivable",
      id: receivable.id,
      variances: diff(receivable as unknown as Record<string, unknown>, next),
      next,
    });
  }

  const bTotals = borrowingRepaymentTotals(input.borrowingRepayments);
  for (const borrowing of input.borrowings) {
    if (!borrowing.id || borrowing.totalPaid === undefined) continue;
    if (!bTotals.has(borrowing.id)) {
      bTotals.set(borrowing.id, { totalPaid: 0, principalPaid: 0 });
    }
    if (!borrowingCacheDrifted(borrowing, bTotals)) continue;
    const next = denormalizedBorrowingCacheFields(
      summarizeBorrowing(
        borrowing,
        input.borrowingRepayments,
        borrowingCacheAsOfDate(borrowing.id, input.borrowingRepayments, today)
      )
    );
    plans.push({
      kind: "borrowing",
      id: borrowing.id,
      variances: diff(borrowing as unknown as Record<string, unknown>, next),
      next,
    });
  }

  return plans;
}
