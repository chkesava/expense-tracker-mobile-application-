import { parseLocalDate } from "./dates";
import { roundMoney } from "./money";
import { activitySubtypeLabel, activityTitle } from "./activityDisplay";
import type { FilterableAccountActivity } from "./accountActivityFilters";
import type { StatementLine } from "./statementParse";
import type { StatementPeriod } from "./accountStatement";

/**
 * Reconciling a bank account against its real statement (SPENDLY-87).
 *
 * Pure throughout: nothing here writes to the ledger, and nothing here edits a
 * record. Reconciling is an act of *reading* — it reports what agrees and what
 * does not, and every correction that follows is an explicit account entry the
 * user chooses to make. A reconciliation that quietly rewrote history would
 * destroy the very thing it exists to establish.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReconciliationStatus = "balanced" | "variance";

export interface ReconciledPair {
  line: StatementLine;
  /** The ledger row this line was matched to. */
  activityId: string;
  date: string;
  description: string;
  amount: number;
  /** True when the dates differ but fall within a day of each other. */
  dateDiffers: boolean;
}

/** A row the ledger has that the statement does not. */
export interface UnmatchedLedgerRow {
  activityId: string;
  date: string;
  description: string;
  subtype: string;
  amount: number;
  kind: "debit" | "credit";
}

export interface AccountReconciliationResult {
  period: StatementPeriod;
  /** Spendly's own closing balance, or undefined when it cannot be stated. */
  ledgerClosingBalance?: number;
  /** What the user read off the real statement, when they entered one. */
  statementClosingBalance?: number;
  /**
   * Statement minus ledger. Positive means the bank says there is more money
   * than Spendly knows about. Undefined when either side is unknown — a
   * variance against an unknown balance is not a variance, it is a guess.
   */
  variance?: number;
  status: ReconciliationStatus;
  /** Lines that found a ledger row, each consuming a different one. */
  matched: ReconciledPair[];
  /** On the statement, absent from Spendly. */
  missingInApp: StatementLine[];
  /** In Spendly, absent from the statement. */
  extraInApp: UnmatchedLedgerRow[];
  /** Statement lines dated outside the selected period, excluded from matching. */
  outOfPeriod: StatementLine[];
}

/** Money is equal to the paisa, never by float identity. */
function sameAmount(a: number, b: number): boolean {
  return roundMoney(a) === roundMoney(b);
}

function datesClose(a: string, b: string): boolean {
  return (
    Math.abs(parseLocalDate(a).getTime() - parseLocalDate(b).getTime()) <= DAY_MS
  );
}

interface Candidate {
  activityId: string;
  date: string;
  description: string;
  subtype: string;
  amount: number;
  kind: "debit" | "credit";
}

/**
 * Finds the ledger row a statement line describes.
 *
 * Exact date and amount first, then the same amount within a day — banks post
 * on their own schedule, and a purchase made late on the 5th routinely lands
 * on the statement dated the 6th. Falling back before trying every exact match
 * would let a near-match steal a row that a later line matches exactly, so the
 * two passes are deliberately ordered and run over the whole line set.
 */
function findCandidate(
  line: StatementLine,
  candidates: Candidate[],
  allowDateDrift: boolean
): number {
  return candidates.findIndex(
    (candidate) =>
      candidate.kind === line.kind &&
      sameAmount(candidate.amount, line.amount) &&
      (allowDateDrift
        ? datesClose(candidate.date, line.date)
        : candidate.date === line.date)
  );
}

function toCandidate(record: FilterableAccountActivity): Candidate {
  const { activity } = record;
  return {
    activityId: activity.id,
    date: activity.date,
    description: activityTitle(activity),
    subtype: activitySubtypeLabel(activity),
    amount: activity.amount,
    kind: activity.type,
  };
}

/**
 * Gives every statement line a key unique within this reconciliation.
 *
 * `parseStatementLines` derives its ids from the row's own content, so two
 * genuinely identical postings — the same amount, to the same merchant, on the
 * same day, which is ordinary for a coffee or a toll — can arrive carrying the
 * same id. Both are real and both must be reconciled separately, so a repeated
 * id is disambiguated rather than deduplicated: dropping one would hide a
 * transaction the bank actually charged.
 */
export function withUniqueLineIds(lines: StatementLine[]): StatementLine[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const count = seen.get(line.id) ?? 0;
    seen.set(line.id, count + 1);
    return count === 0 ? line : { ...line, id: `${line.id}#${count + 1}` };
  });
}

export interface ReconcileOptions {
  /** Spendly's closing balance for the period, from the statement builder. */
  ledgerClosingBalance?: number;
  /** What the user read off the real statement. */
  statementClosingBalance?: number;
}

export function reconcileAccountStatement(
  records: FilterableAccountActivity[],
  lines: StatementLine[],
  period: StatementPeriod,
  options: ReconcileOptions = {}
): AccountReconciliationResult {
  const { ledgerClosingBalance, statementClosingBalance } = options;

  const uniqueLines = withUniqueLineIds(lines);
  const inPeriod: StatementLine[] = [];
  const outOfPeriod: StatementLine[] = [];
  for (const line of uniqueLines) {
    if (line.date >= period.fromDate && line.date <= period.toDate) {
      inPeriod.push(line);
    } else {
      outOfPeriod.push(line);
    }
  }

  const candidates: Candidate[] = records
    .filter(
      (record) =>
        record.activity.date >= period.fromDate &&
        record.activity.date <= period.toDate
    )
    .map(toCandidate);

  const matched: ReconciledPair[] = [];
  const unmatchedLines: StatementLine[] = [];

  // Exact date and amount first, across every line, so a same-day match is
  // never lost to a neighbouring day's line claiming the row first.
  for (const line of inPeriod) {
    const index = findCandidate(line, candidates, false);
    if (index < 0) {
      unmatchedLines.push(line);
      continue;
    }
    const [candidate] = candidates.splice(index, 1);
    matched.push({
      line,
      activityId: candidate.activityId,
      date: candidate.date,
      description: candidate.description,
      amount: candidate.amount,
      dateDiffers: false,
    });
  }

  const missingInApp: StatementLine[] = [];
  for (const line of unmatchedLines) {
    const index = findCandidate(line, candidates, true);
    if (index < 0) {
      missingInApp.push(line);
      continue;
    }
    const [candidate] = candidates.splice(index, 1);
    matched.push({
      line,
      activityId: candidate.activityId,
      date: candidate.date,
      description: candidate.description,
      amount: candidate.amount,
      dateDiffers: candidate.date !== line.date,
    });
  }

  // Whatever no line claimed is in Spendly and not on the statement.
  const extraInApp: UnmatchedLedgerRow[] = candidates.map((candidate) => ({
    activityId: candidate.activityId,
    date: candidate.date,
    description: candidate.description,
    subtype: candidate.subtype,
    amount: candidate.amount,
    kind: candidate.kind,
  }));

  const variance =
    ledgerClosingBalance === undefined || statementClosingBalance === undefined
      ? undefined
      : roundMoney(statementClosingBalance - ledgerClosingBalance);

  return {
    period,
    ledgerClosingBalance,
    statementClosingBalance,
    variance,
    // Only a variance of exactly zero balances. Anything else, however small,
    // is a real disagreement the user should see rather than a rounding
    // pleasantry the app decided to forgive on their behalf.
    status: variance === 0 ? "balanced" : "variance",
    matched: matched.sort((a, b) => a.date.localeCompare(b.date)),
    missingInApp,
    extraInApp,
    outOfPeriod,
  };
}

/**
 * The adjustment that would bring Spendly in line with the statement.
 *
 * Returned as a *proposal*, never applied. The user records it as an ordinary
 * account entry with their own reason, so the correction appears in the ledger
 * as something a person decided rather than something reconciliation did
 * behind their back.
 */
export function proposedAdjustment(
  result: AccountReconciliationResult
): { direction: "credit" | "debit"; amount: number } | undefined {
  const { variance } = result;
  if (variance === undefined || variance === 0) return undefined;
  return {
    direction: variance > 0 ? "credit" : "debit",
    amount: Math.abs(variance),
  };
}
