import {
  currentMonthKey,
  monthFromDateKey,
  shiftMonthKey,
  todayDateKey,
} from "./dates";
import { roundMoney } from "./money";
import { activitySubtypeLabel, activityTitle } from "./activityDisplay";
import type { FilterableAccountActivity } from "./accountActivityFilters";
import { accountMonthDateRange } from "./accountMonthSummary";

/**
 * A downloadable account statement (SPENDLY-79).
 *
 * Built entirely from the normalized `buildAccountActivities()` rows the
 * account screen already holds, so the statement can never disagree with the
 * ledger it was exported from. Nothing here mutates a record: every field is
 * derived, and the rows are copied into presentation shape rather than edited
 * in place.
 *
 * Rendering (CSV, printable HTML) lives in `accountStatementExport`, which
 * computes no figure of its own — so the spreadsheet and the PDF can never
 * report different totals.
 */

export const STATEMENT_PRESETS = [
  "this-month",
  "last-month",
  "last-3-months",
  "this-year",
  "custom",
] as const;

export type StatementPreset = (typeof STATEMENT_PRESETS)[number];

export const DEFAULT_STATEMENT_PRESET: StatementPreset = "this-month";

export interface StatementPeriod {
  preset: StatementPreset;
  /** Inclusive `YYYY-MM-DD` bounds. */
  fromDate: string;
  toDate: string;
  label: string;
}

export interface AccountStatementRow {
  id: string;
  date: string;
  /** Clock time when the ledger knows one. Never invented. */
  time?: string;
  description: string;
  /** Transfer, Bill payment, Cashback, Borrowing, … */
  subtype: string;
  category?: string;
  counterparty?: string;
  /** Exactly one of these is set — a posting is one or the other. */
  debit?: number;
  credit?: number;
  runningBalance?: number;
}

export interface AccountStatementMeta {
  name: string;
  institution?: string;
  last4?: string;
  /** "Credit Card", "Personal Account", … */
  typeLabel: string;
  currency: string;
  /** The timezone the dates were resolved in, stated so they can be read. */
  timezone?: string;
}

export interface AccountStatement {
  account: AccountStatementMeta;
  period: StatementPeriod;
  /** `YYYY-MM-DD` the statement was produced on. */
  generatedAt: string;
  /** False for credit cards: an outstanding liability is not a balance. */
  supportsRunningBalance: boolean;
  openingBalance?: number;
  closingBalance?: number;
  /** Every credit / every debit in the period, transfers included. */
  moneyIn: number;
  moneyOut: number;
  /** Ordinary earning and spending only — money movement is excluded. */
  income: number;
  expenses: number;
  transfersIn: number;
  transfersOut: number;
  netChange: number;
  transactionCount: number;
  /** Distinct movements, not legs. See `accountActivityStats`. */
  transferCount: number;
  /** Oldest first — the order a bank statement is read in. */
  rows: AccountStatementRow[];
  /** Anything the reader must know to trust the figures above. */
  notes: string[];
}

export interface AccountStatementOptions {
  supportsRunningBalance?: boolean;
  /** Defaults to today in the account's timezone. */
  generatedAt?: string;
}

/* ------------------------------------------------------------------ *
 * Periods
 * ------------------------------------------------------------------ */

function monthRangeLabel(fromDate: string, toDate: string): string {
  return fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`;
}

function endOfMonth(month: string): string {
  return accountMonthDateRange(month).toDate;
}

/**
 * Resolves a preset against the day the statement is taken on.
 *
 * `today` is the caller's timezone-resolved date key, so the app's existing
 * timezone handling decides which day "this month" ends on rather than this
 * module reaching for a clock of its own.
 */
export function resolveStatementPeriod(
  preset: StatementPreset,
  today: string = todayDateKey(),
  custom?: { fromDate: string; toDate: string }
): StatementPeriod {
  const month = monthFromDateKey(today) || currentMonthKey();

  if (preset === "custom") {
    const fromDate = custom?.fromDate ?? today;
    const toDate = custom?.toDate ?? today;
    return {
      preset,
      fromDate,
      toDate,
      label: monthRangeLabel(fromDate, toDate),
    };
  }

  if (preset === "this-month") {
    // Ends today, not at month end: a statement must never imply it covers
    // days that have not happened yet.
    return {
      preset,
      fromDate: `${month}-01`,
      toDate: today,
      label: `${month}-01 to ${today}`,
    };
  }

  if (preset === "last-month") {
    const previous = shiftMonthKey(month, -1);
    const fromDate = `${previous}-01`;
    const toDate = endOfMonth(previous);
    return { preset, fromDate, toDate, label: `${fromDate} to ${toDate}` };
  }

  if (preset === "last-3-months") {
    // The three months ending with this one, so the current month's activity
    // is included rather than the window stopping at last month's end.
    const fromDate = `${shiftMonthKey(month, -2)}-01`;
    return { preset, fromDate, toDate: today, label: `${fromDate} to ${today}` };
  }

  const year = today.slice(0, 4);
  const fromDate = `${year}-01-01`;
  return { preset, fromDate, toDate: today, label: `${fromDate} to ${today}` };
}

/** True when `date` falls inside the inclusive period. */
function inPeriod(date: string, period: StatementPeriod): boolean {
  return date >= period.fromDate && date <= period.toDate;
}

export function isValidStatementPeriod(period: {
  fromDate: string;
  toDate: string;
}): boolean {
  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  return (
    isDate(period.fromDate) &&
    isDate(period.toDate) &&
    period.fromDate <= period.toDate
  );
}

/* ------------------------------------------------------------------ *
 * Statement
 * ------------------------------------------------------------------ */

/**
 * The same movement identity SPENDLY-90 counts by: both legs of a transfer
 * whose ends are the same account describe one movement of money, so counting
 * rows there would report two transfers where the user made one.
 */
function movementId(row: FilterableAccountActivity): string {
  const { activity } = row;
  return (
    activity.linkedTransferId ??
    activity.linkedPaymentId ??
    activity.linkedBorrowingId ??
    activity.linkedRepaymentId ??
    activity.linkedReceivableId ??
    activity.linkedReceivableRepaymentId ??
    activity.id
  );
}

/**
 * Balance carried into the period, for a period with no activity of its own.
 *
 * Records arrive newest-first from `buildAccountActivities()`, so the first
 * row dated before the period is the most recent posting behind it.
 */
function balanceBefore(
  records: FilterableAccountActivity[],
  period: StatementPeriod
): number | undefined {
  const previous = records.find(
    (record) => record.activity.date < period.fromDate
  );
  return previous?.activity.runningBalance;
}

function toStatementRow(
  record: FilterableAccountActivity
): AccountStatementRow {
  const { activity } = record;
  const isCredit = activity.type === "credit";
  return {
    id: activity.id,
    date: activity.date,
    time: activity.time,
    description: activityTitle(activity),
    subtype: activitySubtypeLabel(activity),
    category: record.category?.trim() || undefined,
    counterparty: record.counterparty,
    debit: isCredit ? undefined : activity.amount,
    credit: isCredit ? activity.amount : undefined,
    runningBalance: activity.runningBalance,
  };
}

export function buildAccountStatement(
  records: FilterableAccountActivity[],
  account: AccountStatementMeta,
  period: StatementPeriod,
  options: AccountStatementOptions = {}
): AccountStatement {
  const {
    supportsRunningBalance = true,
    generatedAt = todayDateKey(account.timezone),
  } = options;

  const inRange = records.filter((record) =>
    inPeriod(record.activity.date, period)
  );

  let income = 0;
  let expenses = 0;
  let transfersIn = 0;
  let transfersOut = 0;
  let moneyIn = 0;
  let moneyOut = 0;
  const movements = new Set<string>();

  for (const record of inRange) {
    const { amount, type } = record.activity;
    if (type === "credit") moneyIn += amount;
    else moneyOut += amount;

    if (record.kind === "income") income += amount;
    else if (record.kind === "expense") expenses += amount;
    else if (record.kind === "transfers") {
      if (type === "credit") transfersIn += amount;
      else transfersOut += amount;
      movements.add(movementId(record));
    }
  }

  const netChange = roundMoney(moneyIn - moneyOut);
  const notes: string[] = [];

  // Oldest first: a statement is read forwards, and the running balance column
  // only makes sense in the direction it accumulated.
  const rows = [...inRange].reverse().map(toStatementRow);

  const statement: AccountStatement = {
    account,
    period,
    generatedAt,
    supportsRunningBalance,
    moneyIn: roundMoney(moneyIn),
    moneyOut: roundMoney(moneyOut),
    income: roundMoney(income),
    expenses: roundMoney(expenses),
    transfersIn: roundMoney(transfersIn),
    transfersOut: roundMoney(transfersOut),
    netChange,
    transactionCount: inRange.length,
    transferCount: movements.size,
    rows,
    notes,
  };

  if (inRange.length === 0) {
    notes.push("No transactions were recorded in this period.");
  }

  if (!supportsRunningBalance) {
    // A card's outstanding is a liability. Presenting it as an opening and
    // closing bank balance would misrepresent what the account is.
    notes.push(
      "This is a credit card. Its outstanding is a liability, not a running balance, so no opening or closing balance is shown."
    );
    return statement;
  }

  if (inRange.length === 0) {
    // A quiet period neither opens nor closes on a different balance.
    const carried = balanceBefore(records, period);
    statement.openingBalance = carried;
    statement.closingBalance = carried;
    if (carried === undefined) {
      notes.push(
        "No balance is known for this period, so no opening or closing balance is shown."
      );
    }
    return statement;
  }

  // Every row must have contributed to the running balance, or
  // `closing - netChange` would silently disagree with the ledger. Rows from
  // before the account's balance baseline deliberately carry none, so such a
  // period reports its totals and says why the balances are absent rather
  // than printing a figure that does not reconcile.
  const allCounted = inRange.every(
    (record) => record.activity.runningBalance !== undefined
  );
  const closing = inRange[0]?.activity.runningBalance;

  if (!allCounted || closing === undefined) {
    notes.push(
      "Some transactions in this period predate the account's balance baseline, so no opening or closing balance is shown. The totals above are complete."
    );
    return statement;
  }

  statement.closingBalance = closing;
  statement.openingBalance = roundMoney(closing - netChange);
  return statement;
}
