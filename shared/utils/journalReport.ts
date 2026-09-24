/**
 * SPENDLY-113 — the Journal's filtered view, as a report model.
 *
 * Mirrors `accountStatement.ts`: this computes every figure, and the renderers
 * in `journalReportExport.ts` compute none. That is what makes it impossible
 * for the spreadsheet and the PDF to disagree about a total.
 *
 * ## Built from the running-balance rows, not from `filtered`
 *
 * `runJournalFilterPipeline` returns `filtered` in provider order — every
 * expense, then every income, each newest-first by `createdAt`. A file in that
 * order puts all the income below all the spending, which nobody would
 * recognise as "the transactions I was looking at".
 *
 * `runningBalance.rows` is the same set, chronologically ordered by
 * `postingSortMs` with an id tie-break, and it is exactly what `ExpenseList`
 * renders. Building from it means the file matches the screen row for row, the
 * cumulative columns come free and cannot disagree with the ones on screen, and
 * re-exporting an unchanged view produces an identical file.
 *
 * **Oldest first in the file, newest first on screen.** A cumulative column
 * only reads correctly when it accumulates downward with the reader's eye —
 * `statementToHtml` already argues this for account statements. Both renderers
 * use the one direction, and the difference from the screen is stated in the
 * report's own preamble rather than left to be noticed.
 *
 * ## Never diagnosing from a truncated ledger
 *
 * The gate is here rather than in the screen, for the reason SPENDLY-112 set
 * out: a UI gate is a promise, a precondition in a pure function is a
 * guarantee, and only the latter is reachable by the test suite.
 *
 * `unavailable` is a discriminated union rather than a status field on a
 * populated object. An audit report's reader is a panel that can show zero
 * findings harmlessly; this report's reader **writes a file**. Making `report`
 * unreachable in the unavailable branch turns "you exported a partial ledger"
 * from something review has to catch into a type error.
 */

import type { AccountActivityFilters } from "./accountActivityFilters";
import { accountActivityFilterLabels } from "./accountActivityFilterLabels";
import type { JournalScope } from "./journalActivities";
import type { JournalDateScope } from "./journalDateScope";
import type {
  JournalPeriodSummary,
  JournalTotals,
} from "./journalPeriodSummary";
import type { JournalRunningBalance } from "./journalRunningBalance";

/** The file is always oldest-first. See the header. */
export type JournalReportOrder = "oldest-first";

export type JournalReportFlag = "refund" | "investment" | "bill";

export interface JournalReportRow {
  id: string;
  date: string;
  /** Blank when the row never carried one — never invented. */
  time?: string;
  kind: "expense" | "income";
  /** The note the user typed. */
  description: string;
  /** Expenses only. Income has no category by design (`journalActivities`). */
  category?: string;
  subcategory?: string;
  /** Incomes only, and the reason `category` must not be overloaded. */
  source?: string;
  /** The account a row was posted to. Never a counterparty. */
  accountName?: string;
  accountTypeLabel: string;
  isCard: boolean;
  /** Exactly one of these is ever set. */
  debit?: number;
  credit?: number;
  /** Cumulative net cash *movement* up to this row. Never a balance. */
  cashFlowToDate: number;
  cardSpendToDate: number;
  /** Always empty for income. */
  tags: string[];
  /** Expenses only. */
  status?: "audited" | "unaudited";
  flags: JournalReportFlag[];
}

export interface JournalReportPeriod {
  /** "" when the range is open at that end. */
  fromDate: string;
  toDate: string;
  /** "2026-09-01 to 2026-09-30" · "From 2026-09-01" · "All dates". */
  label: string;
  openStart: boolean;
  openEnd: boolean;
  monthKey: string;
  /** True when an explicit range overrode the month pill. */
  monthOverridden: boolean;
}

export interface JournalReport {
  title: string;
  /** "All transactions" | "Income only" | "Expenses only". */
  scopeLabel: string;
  period: JournalReportPeriod;
  /** Supplied by the caller — the engine invents no clock. */
  generatedAt: string;
  timezone?: string;
  currency: string;
  searchQuery: string;
  /** Exactly the chip labels the filter bar shows. */
  appliedFilters: string[];
  totals: JournalTotals;
  /** The period breakdown. Printed, but not written to the CSV. */
  periods: JournalPeriodSummary[];
  rows: JournalReportRow[];
  rowCount: number;
  order: JournalReportOrder;
  /** Anything the reader must know to trust the figures above. */
  notes: string[];
}

export type JournalReportUnavailableReason =
  | "expenses_incomplete"
  | "incomes_incomplete";

export type JournalReportResult =
  | { status: "ready"; report: JournalReport }
  | { status: "unavailable"; reason: JournalReportUnavailableReason };

export interface JournalReportReadiness {
  /** `expensesComplete`, never `!expensesLoading`. */
  expensesComplete: boolean;
  /** `incomesComplete`. A separate flag, and a separate gate. */
  incomesComplete: boolean;
}

export interface JournalReportInput {
  runningBalance: JournalRunningBalance;
  totals: JournalTotals;
  periods: readonly JournalPeriodSummary[];
  dateScope: JournalDateScope;
  filters: AccountActivityFilters;
  query: string;
  scope: JournalScope;
  currency: string;
  timezone?: string;
  /** ISO-8601, with offset. The caller stamps it. */
  generatedAt: string;
  readiness: JournalReportReadiness;
}

/**
 * Fixed caveats, always emitted.
 *
 * Each one is a figure the reader could otherwise misread, and each is a rule
 * the epic enforces structurally somewhere else — saying so in the file is how
 * that rule survives contact with a spreadsheet six months later.
 */
const REPORT_NOTES = [
  "The cumulative column is net cash movement across the rows in this view, not an account balance.",
  "Card purchases are counted in Spent. Payments made to a credit card are not journal rows and are not counted here.",
  "Income rows carry a Source rather than a Category, and never carry tags or an audit status.",
  "The account a row was posted to is in the Account column. Journal rows have no counterparty.",
];

function scopeLabelFor(scope: JournalScope): string {
  if (scope === "incomes") return "Income only";
  if (scope === "expenses") return "Expenses only";
  return "All transactions";
}

/**
 * The resolved range in words, handling all three shapes
 * `resolveJournalDateScope` can return.
 *
 * A one-sided range stays one-sided. Clamping "everything since January" to the
 * selected month, or printing today as a closing bound, would both be
 * inventions — and an invented bound on an exported file is the kind of thing
 * someone reconciles against and cannot explain.
 */
function periodFor(dateScope: JournalDateScope): JournalReportPeriod {
  const { fromDate, toDate, monthKey, monthOverridden } = dateScope;
  const openStart = !fromDate;
  const openEnd = !toDate;

  let label: string;
  if (openStart && openEnd) label = "All dates";
  else if (openStart) label = `Up to ${toDate}`;
  else if (openEnd) label = `From ${fromDate}`;
  else if (fromDate === toDate) label = fromDate;
  else label = `${fromDate} to ${toDate}`;

  return { fromDate, toDate, label, openStart, openEnd, monthKey, monthOverridden };
}

function accountTypeLabelFor(isCard: boolean, hasAccount: boolean): string {
  if (isCard) return "Credit card";
  return hasAccount ? "Cash or bank" : "";
}

function flagsFor(record: {
  isRefund?: boolean;
  isInvestment?: boolean;
  isBill?: boolean;
}): JournalReportFlag[] {
  const flags: JournalReportFlag[] = [];
  if (record.isRefund) flags.push("refund");
  if (record.isInvestment) flags.push("investment");
  if (record.isBill) flags.push("bill");
  return flags;
}

/**
 * Fail closed when the row list and the count disagree.
 *
 * This is a different question from the readiness gate. That one asks "did the
 * ledger finish loading"; this asks "did *we* drop rows on the way" — a slice
 * added for pagination, a map that skipped a malformed row, a renderer capped
 * at N. `assertCycleExportComplete` exists for exactly this reason, because the
 * delivery layer is where rows actually go missing.
 */
export function assertJournalReportComplete(
  report: JournalReport,
  expectedRowCount: number
): void {
  if (report.rowCount !== expectedRowCount) {
    throw new Error(
      `Journal export truncated: expected ${expectedRowCount} rows, got ${report.rowCount}`
    );
  }
  if (report.rows.length !== report.rowCount) {
    throw new Error("Journal export row list disagrees with rowCount");
  }
}

export function buildJournalReport(
  input: JournalReportInput
): JournalReportResult {
  const { readiness, scope } = input;

  // The income sub-tab never shows an expense, so it must not wait on one —
  // the rule the screen used to hold privately, now testable.
  if (scope !== "incomes" && !readiness.expensesComplete) {
    return { status: "unavailable", reason: "expenses_incomplete" };
  }
  if (scope !== "expenses" && !readiness.incomesComplete) {
    return { status: "unavailable", reason: "incomes_incomplete" };
  }

  // `runningBalance.rows` arrives newest-first. One reverse, here, so both
  // renderers read the same direction.
  const ordered = [...input.runningBalance.rows].reverse();

  const rows: JournalReportRow[] = ordered.map((balanceRow) => {
    const { record } = balanceRow;
    const { activity } = record;
    const expense = record.expense;
    const income = record.income;
    const isCard = record.accountKind === "credit";

    return {
      id: activity.id,
      date: activity.date,
      time: activity.time || undefined,
      kind: income ? "income" : "expense",
      description: activity.note ?? "",
      category: expense ? record.category : undefined,
      subcategory: expense ? record.subcategory : undefined,
      source: income ? income.source : undefined,
      accountName: record.accountName,
      accountTypeLabel: accountTypeLabelFor(isCard, Boolean(record.accountName)),
      isCard,
      debit: expense ? activity.amount : undefined,
      credit: income ? activity.amount : undefined,
      cashFlowToDate: balanceRow.cashFlowToDate,
      cardSpendToDate: balanceRow.cardSpendToDate,
      tags: record.tags ?? [],
      status: expense ? record.status : undefined,
      flags: flagsFor(record),
    };
  });

  const report: JournalReport = {
    title: "Journal report",
    scopeLabel: scopeLabelFor(scope),
    period: periodFor(input.dateScope),
    generatedAt: input.generatedAt,
    timezone: input.timezone,
    currency: input.currency,
    searchQuery: input.query.trim(),
    appliedFilters: accountActivityFilterLabels(input.filters),
    totals: input.totals,
    periods: [...input.periods],
    rows,
    rowCount: rows.length,
    order: "oldest-first",
    notes: [...REPORT_NOTES],
  };

  assertJournalReportComplete(report, input.runningBalance.rows.length);

  return { status: "ready", report };
}
