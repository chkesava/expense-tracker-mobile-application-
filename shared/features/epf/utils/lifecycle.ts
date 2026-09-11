/**
 * Contribution credit lifecycle — KAN-68.
 *
 * KAN-67 generates a month as `expected` and stops. This is what happens next:
 * the month ages into `credited`, the user confirms what actually landed, or
 * they record that it did not.
 *
 * The honesty constraint shapes the whole module. Spendly cannot see anyone's
 * EPFO account, so:
 *   - auto-advancing to `credited` is a *projection*, marked by the absence of
 *     `reconciledAt`;
 *   - `missed` and `reversed` are never automatic, because the app cannot
 *     observe either and a wrong guess writes a false negative into someone's
 *     financial history.
 *
 * Pure by necessity: `hooks/**` and `components/**` are never executed by
 * `npm test`, so anything that branches has to live here.
 */

import type {
  EpfContribution,
  EpfContributionActor,
  EpfContributionEvent,
  EpfContributionStatus,
} from "@/shared/features/epf/types";
import { roundMoney } from "@/shared/utils/money";

/** Statuses the automated processor is allowed to move out of. */
const AUTO_ADVANCEABLE: EpfContributionStatus[] = ["expected"];

/**
 * Legal transitions.
 *
 * Deliberately narrow: a backfilled `confirmed` month is user-asserted history
 * and has no business being reversed by this lifecycle, and nothing may leave
 * `draft` except through KAN-66's own save path.
 */
const ALLOWED: Record<EpfContributionStatus, EpfContributionStatus[]> = {
  draft: [],
  confirmed: ["missed", "reversed"],
  expected: ["credited", "partial", "missed"],
  credited: ["partial", "missed", "reversed", "credited"],
  partial: ["credited", "missed", "reversed", "partial"],
  missed: ["credited", "partial"],
  reversed: ["credited"],
};

export function canTransition(
  from: EpfContributionStatus,
  to: EpfContributionStatus
): boolean {
  return (ALLOWED[from] ?? []).includes(to);
}

/** True once the whole expected credit window has elapsed. */
export function isCreditWindowPassed(
  row: Pick<EpfContribution, "expectedCreditTo">,
  todayKey: string
): boolean {
  if (!row.expectedCreditTo) return false;
  return todayKey > row.expectedCreditTo;
}

/**
 * The rows the scheduler may advance to `credited`.
 *
 * Filtering on `status === "expected"` is what makes a repeated run a no-op: a
 * second pass finds nothing left to advance, so no duplicate audit events.
 */
export function contributionsToAutoCredit<
  T extends Pick<EpfContribution, "status" | "expectedCreditTo">,
>(rows: T[], todayKey: string): T[] {
  return rows.filter(
    (row) => AUTO_ADVANCEABLE.includes(row.status) && isCreditWindowPassed(row, todayKey)
  );
}

/**
 * Advance a month to `credited` as a projection.
 *
 * Leaves `reconciledAt` unset — that field is the record of a human having
 * checked, and the scheduler is not one.
 */
export function applyAutoCredit<T extends EpfContribution>(row: T): T {
  return { ...row, status: "credited" };
}

/**
 * Record what actually landed.
 *
 * A smaller actual makes the month `partial` rather than quietly rewriting the
 * projection, so the shortfall stays visible. A larger one stays `credited` —
 * arrears and corrections are normal and are not an error state.
 */
export function applyActualCredit<T extends EpfContribution>(
  row: T,
  input: { amount: number; date: string; reconciledAt: string }
): T {
  const amount = roundMoney(Math.max(0, input.amount));
  const short = amount < row.epfCredit;

  return {
    ...row,
    status: short ? "partial" : "credited",
    creditedAmount: amount,
    creditDate: input.date,
    reconciledAt: input.reconciledAt,
    statusReason: undefined,
  };
}

/** Mark a month as never credited. Always user-asserted. */
export function applyMissed<T extends EpfContribution>(
  row: T,
  reason: string,
  reconciledAt: string
): T {
  return {
    ...row,
    status: "missed",
    creditedAmount: 0,
    reconciledAt,
    statusReason: reason,
  };
}

/** Mark a credited month as reversed. Always user-asserted. */
export function applyReversed<T extends EpfContribution>(
  row: T,
  reason: string,
  reconciledAt: string
): T {
  return {
    ...row,
    status: "reversed",
    reconciledAt,
    statusReason: reason,
  };
}

/** One audit row for a status change. */
export function buildContributionEvent(
  row: Pick<EpfContribution, "id" | "establishmentId" | "month">,
  from: EpfContributionStatus,
  to: EpfContributionStatus,
  meta: { actor: EpfContributionActor; amount?: number; reason?: string }
): Omit<EpfContributionEvent, "id" | "at"> {
  return {
    contributionId: row.id,
    establishmentId: row.establishmentId,
    month: row.month,
    from,
    to,
    amount: meta.amount,
    actor: meta.actor,
    reason: meta.reason,
  };
}

/** Whether a row's credited amount is the user's word or the app's projection. */
export function isReconciled(row: Pick<EpfContribution, "reconciledAt">): boolean {
  return Boolean(row.reconciledAt);
}

export interface EpfLifecycleSummary {
  expected: number;
  credited: number;
  partial: number;
  missed: number;
  reversed: number;
  /** Credited or partial rows the user has not confirmed. */
  unreconciled: number;
  /** Sum of what actually landed where known, else the projection. */
  creditedTotal: number;
}

/** Counts and totals for the current-employment card. */
export function summariseLifecycle(rows: EpfContribution[]): EpfLifecycleSummary {
  const summary: EpfLifecycleSummary = {
    expected: 0,
    credited: 0,
    partial: 0,
    missed: 0,
    reversed: 0,
    unreconciled: 0,
    creditedTotal: 0,
  };

  for (const row of rows) {
    if (row.status === "expected") summary.expected += 1;
    else if (row.status === "credited") summary.credited += 1;
    else if (row.status === "partial") summary.partial += 1;
    else if (row.status === "missed") summary.missed += 1;
    else if (row.status === "reversed") summary.reversed += 1;

    const counts = row.status === "credited" || row.status === "partial";
    if (counts) {
      if (!isReconciled(row)) summary.unreconciled += 1;
      summary.creditedTotal += row.creditedAmount ?? row.epfCredit;
    }
  }

  summary.creditedTotal = roundMoney(summary.creditedTotal);
  return summary;
}

/** Why a projection cannot be shown, if it cannot. */
export type EpfProjectionBlocker = "no_wage" | "no_current_employment" | null;

/**
 * The ticket requires a clear warning when employment dates or contribution
 * configuration are incomplete, rather than a projection built on nothing.
 */
export function projectionBlocker(args: {
  hasCurrentEmployment: boolean;
  latestWage: number;
}): EpfProjectionBlocker {
  if (!args.hasCurrentEmployment) return "no_current_employment";
  if (args.latestWage <= 0) return "no_wage";
  return null;
}
