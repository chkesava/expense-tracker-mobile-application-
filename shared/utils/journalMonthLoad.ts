import type { JournalDateScope } from "./journalDateScope";
import { isDateScopeCoveredByLoadedHistory } from "./journalDateScope";

/**
 * SPENDLY-748 — when the Journal loads the selected month on demand, and when
 * it may trust that period as complete.
 *
 * The live window (SPENDLY-409/596) is the newest 300 rows by `createdAt`.
 * Its oldest `date` says nothing reliable about older months: one back-dated
 * row in the window made every month after its date look "covered", so the
 * month query never ran and an older month showed nothing until "load all".
 *
 * So:
 * - The current month keeps the window (SPENDLY-585): it is covered when the
 *   window's oldest date reaches back to the month start, as before.
 * - Any other month is complete only once its own month-scoped query has
 *   loaded (or the whole ledger is in memory). Until then it is loaded on
 *   demand: one query per collection, cached for the session.
 * - A custom range keeps the previous rule; a single month query can't cover it.
 */
export type JournalMonthLoadInput = {
  scope: Pick<JournalDateScope, "fromDate" | "monthKey" | "monthOverridden">;
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

export function planJournalMonthLoad(input: JournalMonthLoadInput): JournalMonthLoadPlan {
  const { scope } = input;
  const none = (periodComplete: boolean): JournalMonthLoadPlan => ({
    periodComplete,
    loadExpensesMonth: null,
    loadIncomesMonth: null,
  });
  if (input.ledgerComplete) return none(true);

  const windowCovers = isDateScopeCoveredByLoadedHistory(scope, input.oldestLoadedDate);
  if (scope.monthOverridden || !scope.monthKey) return none(windowCovers);

  const monthKey = scope.monthKey;
  const incomesLoaded = input.incomeMonthsLoaded.has(monthKey);
  const expensesLoaded = !input.needsExpenses || input.expenseMonthsLoaded.has(monthKey);
  if (incomesLoaded && expensesLoaded) return none(true);
  if (monthKey === input.currentMonthKey && windowCovers) return none(true);

  return {
    periodComplete: false,
    loadExpensesMonth: expensesLoaded ? null : monthKey,
    loadIncomesMonth: incomesLoaded ? null : monthKey,
  };
}
