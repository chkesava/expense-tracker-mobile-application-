import { shiftMonthKey } from "./dates";
import type { JournalDateScope } from "./journalDateScope";
import { isDateScopeCoveredByLoadedHistory } from "./journalDateScope";

/**
 * SPENDLY-748 / SPENDLY-749 — when the Journal loads the selected month or
 * custom range on demand, and when it may trust that period as complete.
 *
 * The live window (SPENDLY-409/596) is the newest 300 rows by `createdAt`.
 * Its oldest `date` says nothing reliable about older months: one back-dated
 * row in the window makes older months or ranges look "covered" if judged by
 * `oldestLoadedDate <= fromDate`, even when the actual transactions for that
 * period are completely unloaded.
 *
 * So:
 * - The current month keeps the window (SPENDLY-585): it is covered when the
 *   window's oldest date reaches back to the month start (`${currentMonthKey}-01`).
 * - Any other month is complete only once its own month-scoped query has
 *   loaded (or the whole ledger is in memory). Until then it is loaded on
 *   demand: one query per collection, cached for the session.
 * - A custom range (SPENDLY-749):
 *   - An open-ended past range (no `fromDate`) cannot be enumerated into
 *     bounded months; it is complete only once `ledgerComplete` is true.
 *   - A bounded range determines the months it covers (newest first, capped
 *     at MAX_RANGE_MONTHS). Missing months are loaded on demand.
 *   - The custom range is complete only once every month in the range is
 *     confirmed loaded (or covered by the current-month window) and the
 *     range was not truncated past MAX_RANGE_MONTHS.
 */
export const MAX_RANGE_MONTHS = 12;

export type JournalMonthLoadInput = {
  scope: Pick<JournalDateScope, "fromDate" | "toDate" | "monthKey" | "monthOverridden">;
  currentMonthKey: string;
  /** Every page of the collections in view is loaded. */
  ledgerComplete: boolean;
  /** Oldest `date` among the rows in memory for this view. */
  oldestLoadedDate: string | null;
  /** The view shows expenses (false on the income sub-tab). */
  needsExpenses: boolean;
  expenseMonthsLoaded: ReadonlySet<string>;
  incomeMonthsLoaded: ReadonlySet<string>;
};

export type JournalMonthLoadPlan = {
  /** The selected period's rows are all in memory. */
  periodComplete: boolean;
  /** Month-scoped queries still to run (empty when none is needed). */
  loadExpensesMonth: string | null;
  loadIncomesMonth: string | null;
};

export function customRangeMonthsInScope(
  fromDate: string,
  toDate: string | undefined,
  currentMonthKey: string
): { months: string[]; truncated: boolean } {
  const from = fromDate.trim();
  if (!from) return { months: [], truncated: false };
  const to = toDate?.trim() || `${currentMonthKey}-31`;
  if (from > to) return { months: [], truncated: false };

  const firstMonth = from.slice(0, 7);
  let cursor = to.slice(0, 7);
  const months: string[] = [];

  while (cursor >= firstMonth && months.length < MAX_RANGE_MONTHS) {
    months.push(cursor);
    cursor = shiftMonthKey(cursor, -1);
  }

  return { months, truncated: cursor >= firstMonth };
}

export function planJournalMonthLoad(input: JournalMonthLoadInput): JournalMonthLoadPlan {
  const { scope } = input;
  const none = (periodComplete: boolean): JournalMonthLoadPlan => ({
    periodComplete,
    loadExpensesMonth: null,
    loadIncomesMonth: null,
  });
  if (input.ledgerComplete) return none(true);

  const windowCoversCurrentMonth =
    input.oldestLoadedDate !== null &&
    isDateScopeCoveredByLoadedHistory({ fromDate: `${input.currentMonthKey}-01` }, input.oldestLoadedDate);

  // Custom date range (SPENDLY-749)
  if (scope.monthOverridden) {
    if (!scope.fromDate) {
      // Open-ended past range (e.g. toDate only). Cannot enumerate months;
      // requires full ledger to be complete.
      return none(false);
    }

    const { months, truncated } = customRangeMonthsInScope(
      scope.fromDate,
      scope.toDate,
      input.currentMonthKey
    );

    if (months.length === 0) return none(false);

    // Look for missing months (newest to oldest)
    for (const m of months) {
      const isCurrentMonth = m === input.currentMonthKey;
      const currentCovered = isCurrentMonth && windowCoversCurrentMonth;

      const incMissing = !input.incomeMonthsLoaded.has(m) && !currentCovered;
      const expMissing = input.needsExpenses && !input.expenseMonthsLoaded.has(m) && !currentCovered;

      if (incMissing || expMissing) {
        return {
          periodComplete: false,
          loadExpensesMonth: expMissing ? m : null,
          loadIncomesMonth: incMissing ? m : null,
        };
      }
    }

    // All months in scope are loaded. If the range was truncated past 12 months,
    // older history is still missing, so it's not complete.
    return none(!truncated);
  }

  // Standard month selection (SPENDLY-748)
  if (!scope.monthKey) return none(false);

  const monthKey = scope.monthKey;
  const incomesLoaded = input.incomeMonthsLoaded.has(monthKey);
  const expensesLoaded = !input.needsExpenses || input.expenseMonthsLoaded.has(monthKey);
  if (incomesLoaded && expensesLoaded) return none(true);
  if (monthKey === input.currentMonthKey && windowCoversCurrentMonth) return none(true);

  return {
    periodComplete: false,
    loadExpensesMonth: expensesLoaded ? null : monthKey,
    loadIncomesMonth: incomesLoaded ? null : monthKey,
  };
}
