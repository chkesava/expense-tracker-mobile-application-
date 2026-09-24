/**
 * Pure receivable math: interest accrual, repayment allocation, outstanding
 * balance, status and portfolio totals.
 *
 * Accrual itself lives in `interestMath.ts`, shared with borrowings, so money
 * lent and money borrowed cannot drift apart (SPENDLY-160). Nothing here
 * touches Firebase or React Native.
 */

import type {
  Receivable,
  ReceivableRepayment,
  ReceivableStatus,
} from "../types/receivable";
import { receivableInterestTerms } from "../types/receivable";
import {
  accrueInterest,
  allocateInterestFirst,
  describeInterestTerms,
  validatePayment,
  type PaymentAllocation,
} from "./interestMath";
import { roundMoney } from "./money";
export { roundMoney };

function principalComponentOf(repayment: ReceivableRepayment): number {
  return repayment.principalComponent ?? repayment.amount;
}

function interestComponentOf(repayment: ReceivableRepayment): number {
  return repayment.interestComponent ?? 0;
}

/**
 * Interest stops the day a receivable is written off or its remainder waived.
 * A debt you have given up on should not keep climbing in a view you cannot
 * correct — there is no un-cancel, and `deriveStatus` makes CANCELLED sticky.
 */
function accrualEndDate(receivable: Receivable, asOfDate: string): string {
  const stop = receivable.interestStoppedDate;
  if (!stop) return asOfDate;
  return stop < asOfDate ? stop : asOfDate;
}

/** Interest accrued on money lent, between the lent date and `asOfDate`. */
export function computeAccruedInterest(
  receivable: Receivable,
  repayments: ReceivableRepayment[],
  asOfDate: string
): number {
  const movements = repaymentsFor(receivable.id, repayments).map((r) => ({
    date: r.date,
    principalComponent: principalComponentOf(r),
  }));
  return accrueInterest(
    {
      principal: receivable.originalAmount,
      startDate: receivable.lentDate,
      terms: receivableInterestTerms(receivable),
    },
    movements,
    accrualEndDate(receivable, asOfDate)
  );
}

/** Short human label for a receivable's interest configuration. */
export function describeInterest(receivable: Receivable): string {
  return describeInterestTerms(receivableInterestTerms(receivable));
}

export type { PaymentAllocation as RepaymentAllocation };

/** Interest is cleared before principal, the conventional order. */
export function allocateReceivableRepayment(
  amount: number,
  summary: Pick<ReceivableSummary, "outstandingInterest" | "outstandingPrincipal">
): PaymentAllocation {
  return allocateInterestFirst(amount, summary);
}


function repaymentsFor(
  receivableId: string | undefined,
  repayments: ReceivableRepayment[]
): ReceivableRepayment[] {
  if (!receivableId) return [];
  return repayments.filter((r) => r.receivableId === receivableId);
}

/** Chronological, ignoring anything dated after `asOfDate`. */
export function repaymentsUpTo(
  repayments: ReceivableRepayment[],
  asOfDate: string
): ReceivableRepayment[] {
  return repayments
    .filter((r) => r.date <= asOfDate)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface ReceivableSummary {
  receivableId: string;
  originalAmount: number;
  /** Repayment principal components. Legacy repayments count in full here. */
  principalReceived: number;
  interestReceived: number;
  /** All cash actually received — principal + interest. */
  totalReceived: number;
  interestAccrued: number;
  /** Interest forgiven rather than collected. Never cash. */
  interestWaived: number;
  outstandingPrincipal: number;
  outstandingInterest: number;
  /** Everything still owed: principal + interest. */
  outstandingAmount: number;
  status: ReceivableStatus;
  settledDate: string | null;
  isOverdue: boolean;
  repaymentCount: number;
}

function deriveStatus(params: {
  storedStatus: ReceivableStatus;
  outstandingPrincipal: number;
  outstandingInterest: number;
  totalReceived: number;
  isOverdue: boolean;
}): ReceivableStatus {
  // A manual cancel is a deliberate user decision and outranks derivation.
  if (params.storedStatus === "CANCELLED") return "CANCELLED";
  // Getting the principal back is not the same as being square: interest still
  // owed keeps the receivable open until it is collected or waived.
  if (params.outstandingPrincipal <= 0 && params.outstandingInterest <= 0) {
    return "FULLY_SETTLED";
  }
  if (params.isOverdue) return "OVERDUE";
  if (params.totalReceived > 0) return "PARTIALLY_SETTLED";
  return "ACTIVE";
}

/** Authoritative derived view of one receivable. */
export function summarizeReceivable(
  receivable: Receivable,
  repayments: ReceivableRepayment[],
  asOfDate: string
): ReceivableSummary {
  const relevant = repaymentsUpTo(
    repaymentsFor(receivable.id, repayments),
    asOfDate
  );

  const totalReceived = roundMoney(
    relevant.reduce((sum, r) => sum + (r.amount || 0), 0)
  );
  const principalReceived = roundMoney(
    relevant.reduce((sum, r) => sum + principalComponentOf(r), 0)
  );
  const interestReceived = roundMoney(
    relevant.reduce((sum, r) => sum + interestComponentOf(r), 0)
  );
  const outstandingPrincipal = roundMoney(
    Math.max(0, receivable.originalAmount - principalReceived)
  );
  const interestAccrued = computeAccruedInterest(receivable, repayments, asOfDate);
  const interestWaived = receivable.waivedInterest ?? 0;
  const outstandingInterest = roundMoney(
    Math.max(0, interestAccrued - interestReceived - interestWaived)
  );
  const outstandingAmount = roundMoney(
    outstandingPrincipal + outstandingInterest
  );

  const isSettled = outstandingPrincipal <= 0 && outstandingInterest <= 0;
  const isOverdue = Boolean(
    receivable.dueDate && asOfDate > receivable.dueDate && !isSettled
  );

  const status = deriveStatus({
    storedStatus: receivable.status,
    outstandingPrincipal,
    outstandingInterest,
    totalReceived,
    isOverdue,
  });

  const settledDate =
    isSettled && relevant.length > 0
      ? relevant[relevant.length - 1].date
      : isSettled
        ? (receivable.settledDate ?? null)
        : null;

  return {
    receivableId: receivable.id ?? "",
    originalAmount: receivable.originalAmount,
    principalReceived,
    interestReceived,
    totalReceived,
    interestAccrued,
    interestWaived,
    outstandingPrincipal,
    outstandingInterest,
    outstandingAmount,
    status,
    settledDate,
    isOverdue,
    repaymentCount: relevant.length,
  };
}

/**
 * Stored parent fields that exist only so lists can filter/sort without joining
 * repayments. `summarizeReceivable` remains authoritative for display.
 */
export function denormalizedReceivableCacheFields(summary: ReceivableSummary) {
  return {
    totalReceived: summary.totalReceived,
    outstandingAmount: summary.outstandingAmount,
    accruedInterest: summary.interestAccrued,
    status: summary.status,
    settledDate: summary.settledDate,
  };
}

const SUMMARY_AFFECTING_KEYS = [
  "originalAmount",
  "lentDate",
  "dueDate",
  "status",
  "interestRate",
  "interestType",
  "interestFrequency",
  "interestBasis",
  "interestStoppedDate",
  "waivedInterest",
] as const satisfies readonly (keyof Receivable)[];

function receivableUpdateAffectsSummary(updates: Partial<Receivable>): boolean {
  return SUMMARY_AFFECTING_KEYS.some((key) => key in updates);
}

export type ReceivableUpdatePayloadResult =
  | { ok: true; fields: Partial<Receivable>; recomputed: boolean }
  | { ok: false; error: string };

/**
 * Builds the single `updateDoc` payload for a receivable edit.
 *
 * The floor is principal already repaid, not total received: once interest has
 * been collected `totalReceived` exceeds it, and comparing against that would
 * refuse a legitimate principal correction.
 *
 * Edits that change interest, dates, status or principal also stamp the
 * denormalized cache from `summarizeReceivable` so it cannot drift from the
 * derived view — which a status-only write (cancel, settle) previously did.
 */
export function buildReceivableUpdatePayload(
  existing: Receivable,
  updates: Partial<Receivable>,
  repayments: ReceivableRepayment[],
  asOfDate: string
): ReceivableUpdatePayloadResult {
  const current = summarizeReceivable(existing, repayments, asOfDate);
  if (
    updates.originalAmount != null &&
    updates.originalAmount < current.principalReceived
  ) {
    return {
      ok: false,
      error: `Amount cannot be less than ${current.principalReceived} already received.`,
    };
  }

  if (!receivableUpdateAffectsSummary(updates)) {
    return { ok: true, fields: { ...updates }, recomputed: false };
  }

  const next = summarizeReceivable(
    { ...existing, ...updates },
    repayments,
    asOfDate
  );
  return {
    ok: true,
    fields: { ...updates, ...denormalizedReceivableCacheFields(next) },
    recomputed: true,
  };
}

export interface RepaymentValidation {
  ok: boolean;
  error?: string;
}

/** Blocks accidental overpayment unless the caller opts in explicitly. */
export function validateReceivableRepayment(
  amount: number,
  summary: Pick<ReceivableSummary, "outstandingAmount">,
  options?: { allowOverpayment?: boolean }
): RepaymentValidation {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter a repayment amount greater than zero." };
  }

  if (summary.outstandingAmount <= 0) {
    return { ok: false, error: "This receivable is already fully settled." };
  }

  if (amount > summary.outstandingAmount && !options?.allowOverpayment) {
    return {
      ok: false,
      error: `Repayment exceeds the ${summary.outstandingAmount} outstanding.`,
    };
  }

  return { ok: true };
}

export interface ReceivablePortfolioSummary {
  totalLent: number;
  totalReceived: number;
  /** Interest accrued across every receivable, mirroring the borrowing side. */
  totalInterest: number;
  totalOutstanding: number;
  /** Outstanding on receivables already past their due date. */
  overdueAmount: number;
  /** Outstanding on receivables falling due in the current calendar month and
   * not yet overdue — what to expect back before the month is out. */
  dueThisMonthAmount: number;
  activeCount: number;
  settledCount: number;
  overdueCount: number;
  cancelledCount: number;
}

/** Dashboard totals across every receivable. Cancelled still count in totals
 * for historical lent/received, but not as active/overdue. */
export function summarizeReceivables(
  receivables: Receivable[],
  repayments: ReceivableRepayment[],
  asOfDate: string
): ReceivablePortfolioSummary {
  return receivables.reduce<ReceivablePortfolioSummary>(
    (acc, receivable) => {
      const summary = summarizeReceivable(receivable, repayments, asOfDate);
      acc.totalLent = roundMoney(acc.totalLent + summary.originalAmount);
      acc.totalReceived = roundMoney(acc.totalReceived + summary.totalReceived);
      acc.totalInterest = roundMoney(acc.totalInterest + summary.interestAccrued);
      if (summary.status !== "CANCELLED") {
        acc.totalOutstanding = roundMoney(
          acc.totalOutstanding + summary.outstandingAmount
        );
      }
      if (summary.status === "FULLY_SETTLED") {
        acc.settledCount += 1;
      } else if (summary.status === "CANCELLED") {
        acc.cancelledCount += 1;
      } else {
        acc.activeCount += 1;
      }
      if (summary.status === "OVERDUE") {
        acc.overdueCount += 1;
        acc.overdueAmount = roundMoney(
          acc.overdueAmount + summary.outstandingAmount
        );
      } else if (
        summary.status !== "CANCELLED" &&
        summary.status !== "FULLY_SETTLED" &&
        isDueInMonthOf(receivable.dueDate, asOfDate)
      ) {
        // Overdue is its own bucket, so this stays "still to come this month"
        // rather than double-counting money that is already late.
        acc.dueThisMonthAmount = roundMoney(
          acc.dueThisMonthAmount + summary.outstandingAmount
        );
      }
      return acc;
    },
    {
      totalLent: 0,
      totalReceived: 0,
      totalInterest: 0,
      totalOutstanding: 0,
      overdueAmount: 0,
      dueThisMonthAmount: 0,
      activeCount: 0,
      settledCount: 0,
      overdueCount: 0,
      cancelledCount: 0,
    }
  );
}

/** True when `dueDate` falls in the same calendar month as `asOfDate`. */
function isDueInMonthOf(
  dueDate: string | null | undefined,
  asOfDate: string
): boolean {
  if (!dueDate) return false;
  return dueDate.slice(0, 7) === asOfDate.slice(0, 7);
}

/** Receivables assigned to a Space. Unassigned are always excluded. */
export function receivablesInSpace(
  receivables: Receivable[],
  spaceId: string
): Receivable[] {
  if (!spaceId) return [];
  return receivables.filter((r) => r.spaceId === spaceId);
}
