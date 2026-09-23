/**
 * SPENDLY-111 — cumulative cash-flow context for Journal rows.
 *
 * ## Why this is not "balance after"
 *
 * The per-account screen shows a true `runningBalance`, seeded from that
 * account's `openingBalance` and accumulated forward
 * (`accountBalance.ts:542-565`). Two things make that impossible in the
 * Journal:
 *
 * 1. The Journal spans every account, and there is no single opening balance
 *    to seed from. Summing several accounts' openings would produce a number
 *    that reconciles with no account the user can actually look at.
 * 2. The Journal deliberately holds only expenses and incomes (SPENDLY-109).
 *    Transfers, bill payments and cashback move real money but are not in the
 *    row set, so a cumulative total could never equal an account balance.
 *
 * So this computes **cumulative net cash flow across the rows in view** — an
 * honest answer to "how much has moved, and which way, up to this row" — and
 * it is labelled as movement rather than as a balance everywhere it surfaces.
 * It reconciles exactly with the visible transactions, which is what the
 * ticket's acceptance criterion asks for.
 *
 * ## Credit cards are never cash
 *
 * A card purchase is a real `Expense` with `accountId` pointing at the card,
 * so it is in the Journal — but it does not take money out of a bank. Card
 * rows therefore contribute to a separate `card` tally and leave the cash
 * line untouched, mirroring `buildAccountActivities`, which refuses to stamp
 * a running balance on a credit account at all.
 */

import type { JournalRecord } from "./journalActivities";
import { roundMoney } from "./money";
import { postingSortMs } from "./activityDisplay";

export interface JournalCashImpact {
  /** Signed cash movement: negative for money out, positive for money in. */
  cash: number;
  /** Signed card-liability movement: positive when a card purchase adds debt. */
  card: number;
}

export interface JournalBalanceRow {
  record: JournalRecord;
  /** Cumulative net cash flow from the oldest row in view up to and including this one. */
  cashFlowToDate: number;
  /** Cumulative card spend over the same span. */
  cardSpendToDate: number;
  /** This row's own signed contribution. */
  impact: JournalCashImpact;
}

export interface JournalRunningBalance {
  /** Newest-first, matching the order the Journal renders. */
  rows: JournalBalanceRow[];
  /** Net cash flow across every row in view. */
  netCashFlow: number;
  /** Total card spend across every row in view. */
  cardSpend: number;
}

/**
 * One row's contribution. A row on a credit account moves liability, never
 * cash; everything else — including a row with no account at all, which is
 * ordinary cash spending — moves cash.
 */
export function journalCashImpact(record: JournalRecord): JournalCashImpact {
  const { amount, type } = record.activity;
  const signed = type === "debit" ? -amount : amount;

  if (record.accountKind === "credit") {
    // A purchase on a card increases what is owed; a credit against the card
    // (a refund posted to it) reduces it. Neither touches cash.
    return { cash: 0, card: -signed };
  }
  return { cash: signed, card: 0 };
}

/** The underlying row's creation stamp, used only to break same-day ties. */
function createdAtOf(record: JournalRecord): unknown {
  return record.expense?.createdAt ?? record.income?.createdAt;
}

/**
 * Order rows oldest-first for accumulation.
 *
 * `createdAt` is included because `ExpenseList` sorts with it
 * (`postingSortMs(date, time, createdAt)`). If this accumulated in a different
 * order, two same-day rows with no clock time would show cumulative figures
 * that jump around instead of stepping monotonically down the list — the
 * running figure has to agree with the order it is rendered in.
 *
 * The final tie-break on id keeps the result deterministic, matching
 * `buildAccountActivities`.
 */
function chronologically(a: JournalRecord, b: JournalRecord): number {
  const byTime =
    postingSortMs(a.activity.date, a.activity.time, createdAtOf(a)) -
    postingSortMs(b.activity.date, b.activity.time, createdAtOf(b));
  if (byTime !== 0) return byTime;
  return a.activity.id.localeCompare(b.activity.id);
}

/**
 * Accumulate cash flow over the rows in view, oldest to newest, then return
 * newest-first for display. `roundMoney` is applied after every step, not
 * only at the end, because each step is itself a user-visible figure.
 */
export function buildJournalRunningBalance(
  records: JournalRecord[]
): JournalRunningBalance {
  const ordered = [...records].sort(chronologically);

  let cash = 0;
  let card = 0;
  const rows: JournalBalanceRow[] = ordered.map((record) => {
    const impact = journalCashImpact(record);
    cash = roundMoney(cash + impact.cash);
    card = roundMoney(card + impact.card);
    return {
      record,
      cashFlowToDate: cash,
      cardSpendToDate: card,
      impact,
    };
  });

  return {
    rows: rows.reverse(),
    netCashFlow: cash,
    cardSpend: card,
  };
}

/** Cumulative cash flow keyed by activity id, for a list that renders per row. */
export function journalCashFlowById(
  balance: JournalRunningBalance
): Map<string, number> {
  return new Map(
    balance.rows.map((row) => [row.record.activity.id, row.cashFlowToDate])
  );
}
