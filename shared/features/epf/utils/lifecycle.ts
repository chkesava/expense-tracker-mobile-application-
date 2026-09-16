/**
 * Contribution credit lifecycle — KAN-68, reworked by SPENDLY-72.
 *
 * KAN-67 generates a month as `expected` and stops. This is what happens next:
 * a person records what actually landed, or records that it did not.
 *
 * The honesty constraint shapes the whole module. Spendly cannot see anyone's
 * EPFO account, so **nothing here is automatic**. `credited`, `partial`,
 * `missed` and `reversed` are all assertions about money, and the app cannot
 * observe any of them.
 *
 * KAN-68 made one exception: a month whose credit window had elapsed was
 * auto-advanced to `credited` and labelled a projection. SPENDLY-72 removed it.
 * The label never reached the balance — `isBalanceBearing` counted the row —
 * so a contribution nobody had seen was reported as money in the fund. A month
 * past its deadline with nothing recorded now simply *reads* as overdue, via
 * `deriveMonthState` in `monthState.ts`, and the document stays `expected`.
 *
 * This file owns the transitions. `monthState.ts` owns how a row reads against
 * the calendar. Keeping them apart is what stops a calendar reading from ever
 * becoming a stored fact.
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

/**
 * Legal transitions.
 *
 * `confirmed` gained `credited`/`partial` in SPENDLY-72. A backfilled month is
 * user-asserted history and still may not be *rewritten* by the lifecycle, but
 * attaching the credit that actually landed to a month someone typed is adding
 * a fact, not reversing one — and `applyActualCredit` demands an amount and a
 * date before it will. Without this a current month saved from Backfill was a
 * dead end: "Manual" forever, with no way to record the real credit.
 *
 * `draft` stays empty. A draft is not yet a claim about anything; it reaches
 * `confirmed` through KAN-66's own save path, and a draft sitting in the
 * current or a future month is healed to `expected` by the repair pass rather
 * than credited in place.
 *
 * `reversed` gained `partial` in SPENDLY-77. Record credit can land on either
 * `credited` or `partial` depending on the amount, and the sheet only offers
 * that button when both are legal. Listing only `credited` hid the action and
 * left a reversed month with no way to record the money when it came back.
 */
const ALLOWED: Record<EpfContributionStatus, EpfContributionStatus[]> = {
  draft: [],
  confirmed: ["missed", "reversed", "credited", "partial"],
  expected: ["credited", "partial", "missed"],
  credited: ["partial", "missed", "reversed", "credited"],
  partial: ["credited", "missed", "reversed", "partial"],
  missed: ["credited", "partial"],
  reversed: ["credited", "partial"],
};

export function canTransition(
  from: EpfContributionStatus,
  to: EpfContributionStatus
): boolean {
  return (ALLOWED[from] ?? []).includes(to);
}

/**
 * Whether the credit sheet may offer Record credit.
 *
 * `applyActualCredit` writes `partial` on a shortfall, so both landings must
 * be legal or the sheet would accept an amount and then reject it on the way
 * out. Lives here because `components/**` is never collected by `npm test`.
 */
export function canRecordCredit(status: EpfContributionStatus): boolean {
  return canTransition(status, "credited") && canTransition(status, "partial");
}

/**
 * Why a rejected transition was rejected, in words a person can act on.
 *
 * The old message named raw statuses — "Cannot move a draft month to
 * credited." — which told the user what the code refused to do and nothing
 * about what to do instead. The ticket asks for a useful explanation; the
 * entered data is already safe, because `applyTransition` returns `false` and
 * the sheet only closes on `true`.
 */
export function transitionRejectionMessage(
  from: EpfContributionStatus,
  to: EpfContributionStatus
): string {
  if (from === "draft") {
    return "Save this month under Backfill first — a draft can't take a credit yet.";
  }
  if (from === "reversed" && to !== "credited" && to !== "partial") {
    return "This month was reversed. Record the credit again if it came back.";
  }
  if (to === "reversed") {
    return "Only a credited month can be reversed.";
  }
  return `A ${from} month can't be marked ${to}.`;
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
  /** `"none"` for a row that did not exist before — scheduled generation. */
  from: EpfContributionStatus | "none",
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
