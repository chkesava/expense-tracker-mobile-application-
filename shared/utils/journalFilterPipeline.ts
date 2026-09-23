/**
 * SPENDLY-109 — the Journal's search/filter pipeline, as one pure function.
 *
 * The acceptance criteria are about *combinations* across the whole pipeline —
 * search plus filters plus the month/range interaction — so the pipeline cannot
 * live in `app/`: vitest only collects `shared|services|lib|scripts|supabase`.
 * `ledger.tsx` calls this from a single `useMemo`, so the code under test is
 * literally the code that ships.
 *
 * Step order mirrors `app/(app)/accounts/[id].tsx` exactly, including the two
 * decisions that are easy to get backwards:
 *
 * - Filter *options* come from the unsearched set, so a search can never leave
 *   the advanced sheet with empty pickers.
 * - Search runs *before* filters, so the chip counts and the sheet's live
 *   result count describe the rows actually on screen.
 */

import type { AccountType, Expense, Income } from "@/shared/types/expense";
import {
  applyAccountActivityFilters,
  countActiveAccountActivityFilters,
  getAccountActivityFilterOptions,
  getAccountActivityFilterValidationError,
  type AccountActivityFilterOptions,
  type AccountActivityFilters,
} from "./accountActivityFilters";
import { searchAccountActivities } from "./accountActivitySearch";
import {
  buildJournalRecords,
  journalRecordsToRows,
  type JournalAccount,
  type JournalRecord,
  type JournalScope,
} from "./journalActivities";
import {
  buildJournalRunningBalance,
  type JournalRunningBalance,
} from "./journalRunningBalance";
import {
  summarizeJournalPeriods,
  summarizeJournalTotals,
  type JournalPeriodGranularity,
  type JournalPeriodSummary,
  type JournalTotals,
} from "./journalPeriodSummary";
import {
  resolveJournalDateScope,
  type JournalDateScope,
} from "./journalDateScope";
import type { FirstDayOfWeek } from "./dates";

export interface JournalPipelineInput {
  expenses: Expense[];
  incomes: Income[];
  accounts: JournalAccount[];
  query: string;
  filters: AccountActivityFilters;
  monthKey?: string;
  scope?: JournalScope;
  /** SPENDLY-111 — lets a card purchase be told apart from cash leaving a bank. */
  accountTypes?: Pick<AccountType, "id" | "name">[];
  /** SPENDLY-111 — bucketing for the period breakdown. Defaults to "month". */
  granularity?: JournalPeriodGranularity;
  firstDayOfWeek?: FirstDayOfWeek;
}

export interface JournalKindCounts {
  all: number;
  income: number;
  expense: number;
  transfers: number;
}

export interface JournalPipelineResult {
  /** Every canonical row in scope, before search/filters. Drives `totalCount`. */
  records: JournalRecord[];
  /** Built from `records`, never from the searched set. */
  filterOptions: AccountActivityFilterOptions;
  dateScope: JournalDateScope;
  /** `filters` with the resolved month-or-range injected. */
  effectiveFilters: AccountActivityFilters;
  kindCounts: JournalKindCounts;
  filtered: JournalRecord[];
  /** `filtered`, split for `ExpenseList`. Same object references as the input. */
  rows: { expenses: Expense[]; incomes: Income[] };
  /** Counts the *user's* filters only — never the injected month range. */
  activeFilterCount: number;
  validationError: string | null;
  /**
   * SPENDLY-111 — cumulative cash flow over `filtered`, newest-first. This is
   * movement across the rows in view, not an account balance; see
   * `journalRunningBalance.ts` for why the Journal cannot have the latter.
   */
  runningBalance: JournalRunningBalance;
  /** Totals over `filtered`. */
  totals: JournalTotals;
  /** `filtered` bucketed by day / week / month, newest bucket first. */
  periods: JournalPeriodSummary[];
}

/** Inject a resolved scope into a filter set without disturbing anything else. */
export function withJournalDateScope(
  filters: AccountActivityFilters,
  scope: JournalDateScope
): AccountActivityFilters {
  return { ...filters, fromDate: scope.fromDate, toDate: scope.toDate };
}

export function runJournalFilterPipeline(
  input: JournalPipelineInput
): JournalPipelineResult {
  const records = buildJournalRecords(
    input.expenses,
    input.incomes,
    input.accounts,
    { scope: input.scope, accountTypes: input.accountTypes }
  );

  const filterOptions = getAccountActivityFilterOptions(records);
  const searched = searchAccountActivities(records, input.query);

  const dateScope = resolveJournalDateScope(input.monthKey, input.filters);
  const effectiveFilters = withJournalDateScope(input.filters, dateScope);

  // Kind counts ignore the kind filter itself — otherwise selecting "Income"
  // would zero the Expense chip and there would be no way back.
  const kindScoped = applyAccountActivityFilters(searched, {
    ...effectiveFilters,
    kind: "all",
  });
  const kindCounts = kindScoped.reduce<JournalKindCounts>(
    (counts, record) => {
      if (record.kind !== "other") counts[record.kind] += 1;
      return counts;
    },
    { all: kindScoped.length, income: 0, expense: 0, transfers: 0 }
  );

  const filtered = applyAccountActivityFilters(searched, effectiveFilters);

  return {
    runningBalance: buildJournalRunningBalance(filtered),
    totals: summarizeJournalTotals(filtered),
    periods: summarizeJournalPeriods(filtered, input.granularity ?? "month", {
      firstDayOfWeek: input.firstDayOfWeek,
    }),
    records,
    filterOptions,
    dateScope,
    effectiveFilters,
    kindCounts,
    filtered,
    rows: journalRecordsToRows(filtered),
    // The raw filters, not the effective ones: the month pill is a separate
    // control with its own affordance, so counting the range it injects would
    // claim active filters on a screen the user never filtered.
    activeFilterCount: countActiveAccountActivityFilters(input.filters),
    validationError: getAccountActivityFilterValidationError(input.filters),
  };
}
