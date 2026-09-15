/**
 * What a contribution month actually *is* — SPENDLY-72.
 *
 * The stored `status` is not the whole answer. An `expected` row means three
 * different things depending on the calendar: a month that has not happened
 * yet, one whose credit is not due yet, and one whose deadline has passed with
 * nothing recorded. Before this, all three rendered as "Expected" and the
 * scheduler resolved the third by *inventing a credit* — which is the bug the
 * ticket is about.
 *
 * So the calendar reading is derived, never stored. A month past its window
 * renders as overdue; the document still says `expected`. That means no enum
 * change, no migration, no write pass to make idempotent, and no way for a
 * projection to leak into a balance: `isBalanceBearing` still sees `expected`.
 *
 * Pure by necessity — `vitest.config.ts` never collects `hooks/**` or
 * `components/**`.
 */

import type { EpfContribution } from "@/shared/features/epf/types";
import { isBalanceBearing } from "@/shared/features/epf/utils/contributions";
import { isReconciled } from "@/shared/features/epf/utils/lifecycle";
import { statutoryDueDate } from "@/shared/features/epf/utils/schedule";
import { monthLabel } from "@/shared/utils/monthLabel";
import { roundMoney } from "@/shared/utils/money";

/**
 * The stored statuses, with `expected` split by where today sits relative to
 * the credit window. Everything else passes through unchanged.
 */
export type EpfMonthState =
  | "draft"
  | "confirmed"
  | "projected"
  | "awaiting"
  | "overdue"
  | "credited"
  | "partial"
  | "missed"
  | "reversed";

/** True once the whole expected credit window has elapsed. */
export function isCreditWindowPassed(
  row: Pick<EpfContribution, "expectedCreditTo">,
  todayKey: string
): boolean {
  if (!row.expectedCreditTo) return false;
  return todayKey > row.expectedCreditTo;
}

/** The fields the reading depends on. Nothing here is written. */
export type EpfMonthStateInput = Pick<
  EpfContribution,
  "month" | "status" | "expectedCreditFrom" | "expectedCreditTo"
>;

/**
 * Read a month against the clock.
 *
 * A row with no `expectedCreditTo` can never be `overdue`: pre-SPENDLY-1
 * client-written rows lack the window, and `isCreditWindowPassed` already
 * returns `false` for them. That is the right failure direction — telling
 * someone a contribution is late on the strength of a missing field would be
 * exactly the kind of confident wrong answer this module exists to avoid. The
 * repair pass stamps the window, and the row starts ageing from then.
 */
export function deriveMonthState(
  row: EpfMonthStateInput,
  todayKey: string,
  currentMonth: string
): EpfMonthState {
  if (row.status !== "expected") return row.status;
  if (row.month > currentMonth) return "projected";
  return isCreditWindowPassed(row, todayKey) ? "overdue" : "awaiting";
}

/** True while the month is still waiting on money — nothing has been recorded. */
export function isAwaitingCredit(state: EpfMonthState): boolean {
  return state === "projected" || state === "awaiting" || state === "overdue";
}

/**
 * The statutory due date to show on a row, `YYYY-MM-DD`.
 *
 * Prefers the stored `expectedCreditFrom` so a row written under an older rule
 * keeps the date it was actually given, and falls back to recomputing from the
 * wage month — the value is a pure function of the month, which is what makes
 * the missing-window case fixable forward with no migration.
 */
export function dueDateFor(row: Pick<EpfContribution, "month" | "expectedCreditFrom">): string {
  return row.expectedCreditFrom ?? statutoryDueDate(row.month);
}

/**
 * `"2026-10-15"` → `"15 Oct 2026"`, for the due date on a row chip.
 *
 * Deliberately not `formatDisplayDate`: that honours the user's DD/MM vs MM/DD
 * preference, which is the right call for a date they entered and the wrong
 * one inside a chip, where an unambiguous day-month reads the same either way.
 */
export function dueDateLabel(dateKey: string): string {
  const day = Number(dateKey.slice(8, 10));
  if (!day) return dateKey;
  return `${day} ${monthLabel(dateKey.slice(0, 7))}`;
}

export interface EpfLifecycleSummary {
  /** A month that has not happened yet. */
  projected: number;
  /** Happened; the credit is not late yet. */
  awaiting: number;
  /** Past the credit window with nothing recorded. */
  overdue: number;
  draft: number;
  /** Typed under Backfill and saved as history — shown as "Manual". */
  confirmed: number;
  credited: number;
  partial: number;
  missed: number;
  reversed: number;
  /** Credited or partial rows nobody has confirmed. Legacy data only now. */
  unreconciled: number;
  /**
   * Money in the fund, over exactly `BALANCE_BEARING_STATUSES`.
   *
   * SPENDLY-72: this used to count `credited | partial` only, while History,
   * `establishmentBalanceBreakdown` and the portfolio counted `confirmed` too.
   * A Current tab full of backfilled months therefore headlined **₹0** next to
   * rows plainly holding money, and disagreed with every other screen. One
   * definition now — `isBalanceBearing` — so the four cannot drift again.
   */
  creditedTotal: number;
  /** Money still to come: projected + awaiting + overdue. Never in a balance. */
  awaitedTotal: number;
}

/**
 * Counts and totals for the Current tab header — SPENDLY-72.
 *
 * Takes the clock because the three readings of `expected` are a calendar
 * question, and summarising them any other way is how the header came to
 * disagree with its own rows.
 */
export function summariseLifecycle(
  rows: EpfContribution[],
  todayKey: string,
  currentMonth: string
): EpfLifecycleSummary {
  const summary: EpfLifecycleSummary = {
    projected: 0,
    awaiting: 0,
    overdue: 0,
    draft: 0,
    confirmed: 0,
    credited: 0,
    partial: 0,
    missed: 0,
    reversed: 0,
    unreconciled: 0,
    creditedTotal: 0,
    awaitedTotal: 0,
  };

  for (const row of rows) {
    const state = deriveMonthState(row, todayKey, currentMonth);
    summary[state] += 1;

    if (isBalanceBearing(row.status)) {
      summary.creditedTotal += row.creditedAmount ?? row.epfCredit;
      if ((row.status === "credited" || row.status === "partial") && !isReconciled(row)) {
        summary.unreconciled += 1;
      }
    } else if (isAwaitingCredit(state)) {
      summary.awaitedTotal += row.epfCredit;
    }
  }

  summary.creditedTotal = roundMoney(summary.creditedTotal);
  summary.awaitedTotal = roundMoney(summary.awaitedTotal);
  return summary;
}
