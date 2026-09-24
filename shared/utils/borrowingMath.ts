/**
 * Pure borrowing math: interest accrual, repayment allocation and settlement.
 *
 * Nothing here touches Firebase or React Native so it stays unit testable and
 * usable from the shared typecheck project.
 */

import type {
  Borrowing,
  BorrowingRepayment,
  BorrowingStatus,
} from "../types/borrowing";
import {
  accrueInterest,
  allocateInterestFirst,
  describeInterestTerms,
  elapsedMonths,
  monthlyRateOf,
  validatePayment,
  type InterestPosition,
  type InterestTerms,
} from "./interestMath";
import { roundMoney } from "./money";
export { roundMoney };
/** Re-exported so this module's public API is unchanged (SPENDLY-160). */
export { elapsedMonths };

/**
 * The accrual engine moved to `interestMath.ts` so money lent accrues through
 * the same code. Everything below keeps its old name and signature; only the
 * bodies became adapters.
 */
function termsOf(borrowing: Borrowing): InterestTerms {
  return {
    rate: borrowing.interestRate,
    type: borrowing.interestType,
    frequency: borrowing.interestFrequency,
    basis: borrowing.interestBasis,
  };
}

function positionOf(borrowing: Borrowing): InterestPosition {
  return {
    principal: borrowing.principalAmount,
    startDate: borrowing.borrowedDate,
    terms: termsOf(borrowing),
  };
}

/** Per-month rate as a decimal. Returns 0 for one-time and interest-free. */
export function monthlyInterestRate(borrowing: Borrowing): number {
  return monthlyRateOf(termsOf(borrowing));
}

function principalComponentOf(repayment: BorrowingRepayment): number {
  return repayment.principalComponent ?? repayment.amount;
}

function interestComponentOf(repayment: BorrowingRepayment): number {
  return repayment.interestComponent ?? 0;
}

function repaymentsFor(
  borrowingId: string | undefined,
  repayments: BorrowingRepayment[]
): BorrowingRepayment[] {
  if (!borrowingId) return [];
  return repayments.filter((r) => r.borrowingId === borrowingId);
}

/** Chronological, ignoring anything dated after `asOfDate`. */
export function repaymentsUpTo(
  repayments: BorrowingRepayment[],
  asOfDate: string
): BorrowingRepayment[] {
  return repayments
    .filter((r) => r.date <= asOfDate)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Interest accrued between the borrowed date and `asOfDate`.
 *
 * With an `OUTSTANDING_PRINCIPAL` basis the timeline is split at every
 * repayment so each segment charges only what was actually owed then.
 */
export function computeAccruedInterest(
  borrowing: Borrowing,
  repayments: BorrowingRepayment[],
  asOfDate: string
): number {
  // The id filter stays here: an id-less borrowing has no repayments to find,
  // so it accrues on full principal exactly as it did before the extraction.
  const movements = repaymentsFor(borrowing.id, repayments).map((r) => ({
    date: r.date,
    principalComponent: principalComponentOf(r),
  }));
  return accrueInterest(positionOf(borrowing), movements, asOfDate);
}

export interface BorrowingSummary {
  borrowingId: string;
  principalAmount: number;
  principalPaid: number;
  outstandingPrincipal: number;
  interestAccrued: number;
  interestPaid: number;
  outstandingInterest: number;
  totalPaid: number;
  totalOutstanding: number;
  status: BorrowingStatus;
  settledDate: string | null;
  isOverdue: boolean;
  repaymentCount: number;
}

function deriveStatus(params: {
  storedStatus: BorrowingStatus;
  outstandingPrincipal: number;
  outstandingInterest: number;
  totalPaid: number;
  isOverdue: boolean;
}): BorrowingStatus {
  // A manual close is a deliberate user decision and outranks derivation.
  if (params.storedStatus === "CLOSED") return "CLOSED";
  if (params.outstandingPrincipal <= 0 && params.outstandingInterest <= 0) {
    return "FULLY_SETTLED";
  }
  if (params.isOverdue) return "OVERDUE";
  if (params.totalPaid > 0) return "PARTIALLY_SETTLED";
  return "ACTIVE";
}

/** Authoritative derived view of one borrowing. */
export function summarizeBorrowing(
  borrowing: Borrowing,
  repayments: BorrowingRepayment[],
  asOfDate: string
): BorrowingSummary {
  const relevant = repaymentsUpTo(
    repaymentsFor(borrowing.id, repayments),
    asOfDate
  );

  const principalPaid = roundMoney(
    relevant.reduce((sum, r) => sum + principalComponentOf(r), 0)
  );
  const interestPaid = roundMoney(
    relevant.reduce((sum, r) => sum + interestComponentOf(r), 0)
  );
  const totalPaid = roundMoney(relevant.reduce((sum, r) => sum + r.amount, 0));

  const outstandingPrincipal = roundMoney(
    Math.max(0, borrowing.principalAmount - principalPaid)
  );
  const interestAccrued = computeAccruedInterest(borrowing, repayments, asOfDate);
  const outstandingInterest = roundMoney(
    Math.max(0, interestAccrued - interestPaid)
  );
  const totalOutstanding = roundMoney(outstandingPrincipal + outstandingInterest);

  const isSettled = outstandingPrincipal <= 0 && outstandingInterest <= 0;
  const isOverdue = Boolean(
    borrowing.dueDate && asOfDate > borrowing.dueDate && !isSettled
  );

  const status = deriveStatus({
    storedStatus: borrowing.status,
    outstandingPrincipal,
    outstandingInterest,
    totalPaid,
    isOverdue,
  });

  const settledDate =
    isSettled && relevant.length > 0
      ? relevant[relevant.length - 1].date
      : isSettled
        ? (borrowing.settledDate ?? null)
        : null;

  return {
    borrowingId: borrowing.id ?? "",
    principalAmount: borrowing.principalAmount,
    principalPaid,
    outstandingPrincipal,
    interestAccrued,
    interestPaid,
    outstandingInterest,
    totalPaid,
    totalOutstanding,
    status,
    settledDate,
    isOverdue,
    repaymentCount: relevant.length,
  };
}

/**
 * Stored parent fields that exist only so lists can filter/sort without
 * joining repayments. `summarizeBorrowing` remains authoritative for display.
 */
export function denormalizedBorrowingCacheFields(summary: BorrowingSummary) {
  return {
    outstandingPrincipal: summary.outstandingPrincipal,
    accruedInterest: summary.interestAccrued,
    totalOutstanding: summary.totalOutstanding,
    status: summary.status,
    settledDate: summary.settledDate,
  };
}

const SUMMARY_AFFECTING_KEYS = [
  "principalAmount",
  "interestRate",
  "interestType",
  "interestFrequency",
  "interestBasis",
  "borrowedDate",
  "dueDate",
  "status",
] as const satisfies readonly (keyof Borrowing)[];

export type BorrowingUpdatePayloadResult =
  | { ok: false; error: string }
  | {
      ok: true;
      fields: Partial<Borrowing>;
      recomputed: boolean;
    };

function borrowingUpdateAffectsSummary(updates: Partial<Borrowing>): boolean {
  return SUMMARY_AFFECTING_KEYS.some((key) => key in updates);
}

/**
 * Builds the single `updateDoc` payload for a borrowing edit.
 *
 * Principal cannot drop below already-repaid principal. Edits that change
 * interest, dates, status, or principal also stamp the denormalized cache
 * fields from `summarizeBorrowing` so they cannot drift from the derived view.
 */
export function buildBorrowingUpdatePayload(
  existing: Borrowing,
  updates: Partial<Borrowing>,
  repayments: BorrowingRepayment[],
  asOfDate: string
): BorrowingUpdatePayloadResult {
  const current = summarizeBorrowing(existing, repayments, asOfDate);
  if (
    updates.principalAmount != null &&
    updates.principalAmount < current.principalPaid
  ) {
    return {
      ok: false,
      error: `Principal cannot be less than ${current.principalPaid} already repaid.`,
    };
  }

  if (!borrowingUpdateAffectsSummary(updates)) {
    return { ok: true, fields: { ...updates }, recomputed: false };
  }

  const next = summarizeBorrowing(
    { ...existing, ...updates },
    repayments,
    asOfDate
  );
  return {
    ok: true,
    fields: {
      ...updates,
      ...denormalizedBorrowingCacheFields(next),
    },
    recomputed: true,
  };
}

export interface RepaymentAllocation {
  interestComponent: number;
  principalComponent: number;
  /** Anything beyond what is owed. Non-zero only when overpayment is allowed. */
  overpayment: number;
}

/** Interest is cleared before principal, the conventional order. */
export function allocateRepayment(
  amount: number,
  summary: Pick<BorrowingSummary, "outstandingInterest" | "outstandingPrincipal">
): RepaymentAllocation {
  return allocateInterestFirst(amount, summary);
}

export interface RepaymentValidation {
  ok: boolean;
  error?: string;
}

/** Blocks accidental overpayment unless the caller opts in explicitly. */
export function validateRepayment(
  amount: number,
  summary: Pick<BorrowingSummary, "outstandingInterest" | "outstandingPrincipal">,
  options?: { allowOverpayment?: boolean }
): RepaymentValidation {
  return validatePayment(amount, summary, { ...options, subject: "borrowing" });
}

/** Short human label for a borrowing's interest configuration. */
export function describeInterest(borrowing: Borrowing): string {
  return describeInterestTerms(termsOf(borrowing));
}

export interface BorrowingPortfolioSummary {
  totalBorrowed: number;
  totalOutstanding: number;
  totalInterest: number;
  totalRepaid: number;
  activeCount: number;
  settledCount: number;
  overdueCount: number;
}

/** Dashboard totals across every borrowing. */
export function summarizeBorrowings(
  borrowings: Borrowing[],
  repayments: BorrowingRepayment[],
  asOfDate: string
): BorrowingPortfolioSummary {
  return borrowings.reduce<BorrowingPortfolioSummary>(
    (acc, borrowing) => {
      const summary = summarizeBorrowing(borrowing, repayments, asOfDate);
      acc.totalBorrowed = roundMoney(acc.totalBorrowed + summary.principalAmount);
      acc.totalOutstanding = roundMoney(
        acc.totalOutstanding + summary.totalOutstanding
      );
      acc.totalInterest = roundMoney(acc.totalInterest + summary.interestAccrued);
      acc.totalRepaid = roundMoney(acc.totalRepaid + summary.totalPaid);
      if (summary.status === "FULLY_SETTLED" || summary.status === "CLOSED") {
        acc.settledCount += 1;
      } else {
        acc.activeCount += 1;
      }
      if (summary.status === "OVERDUE") acc.overdueCount += 1;
      return acc;
    },
    {
      totalBorrowed: 0,
      totalOutstanding: 0,
      totalInterest: 0,
      totalRepaid: 0,
      activeCount: 0,
      settledCount: 0,
      overdueCount: 0,
    }
  );
}
