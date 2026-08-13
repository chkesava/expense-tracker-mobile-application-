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
import { daysInMonth, parseLocalDate } from "./dates";

/** Guards against runaway loops on absurd date ranges (200 years). */
const MAX_MONTH_STEPS = 2400;

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function addMonthsClamped(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const day = Math.min(
    date.getDate(),
    daysInMonth(target.getFullYear(), target.getMonth())
  );
  return new Date(target.getFullYear(), target.getMonth(), day);
}

/**
 * Months between two date keys, with the trailing partial month expressed as a
 * fraction of that month's own length. Exactly 1 at a calendar month boundary.
 */
export function elapsedMonths(fromKey: string, toKey: string): number {
  const from = parseLocalDate(fromKey);
  const to = parseLocalDate(toKey);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return 0;
  if (to.getTime() <= from.getTime()) return 0;

  let whole = 0;
  while (
    whole < MAX_MONTH_STEPS &&
    addMonthsClamped(from, whole + 1).getTime() <= to.getTime()
  ) {
    whole += 1;
  }

  const anchor = addMonthsClamped(from, whole);
  const nextAnchor = addMonthsClamped(from, whole + 1);
  const span = nextAnchor.getTime() - anchor.getTime();
  if (span <= 0) return whole;

  return whole + (to.getTime() - anchor.getTime()) / span;
}

/** Per-month rate as a decimal. Returns 0 for one-time and interest-free. */
export function monthlyInterestRate(borrowing: Borrowing): number {
  if (borrowing.interestType === "NONE") return 0;
  const rate = borrowing.interestRate;
  if (!Number.isFinite(rate) || rate <= 0) return 0;

  switch (borrowing.interestFrequency) {
    case "MONTHLY":
      return rate / 100;
    case "ANNUAL":
      return rate / 100 / 12;
    default:
      return 0;
  }
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
  if (borrowing.interestType === "NONE") return 0;
  if (asOfDate < borrowing.borrowedDate) return 0;

  if (borrowing.interestFrequency === "ONE_TIME") {
    const rate = borrowing.interestRate;
    if (!Number.isFinite(rate) || rate <= 0) return 0;
    return roundMoney((borrowing.principalAmount * rate) / 100);
  }

  const monthlyRate = monthlyInterestRate(borrowing);
  if (monthlyRate <= 0) return 0;

  if (borrowing.interestBasis === "ORIGINAL_PRINCIPAL") {
    const months = elapsedMonths(borrowing.borrowedDate, asOfDate);
    return roundMoney(borrowing.principalAmount * monthlyRate * months);
  }

  const relevant = repaymentsUpTo(
    repaymentsFor(borrowing.id, repayments),
    asOfDate
  );

  let cursor = borrowing.borrowedDate;
  let outstanding = borrowing.principalAmount;
  let interest = 0;

  for (const repayment of relevant) {
    const segmentEnd = repayment.date < cursor ? cursor : repayment.date;
    interest +=
      Math.max(0, outstanding) * monthlyRate * elapsedMonths(cursor, segmentEnd);
    outstanding -= principalComponentOf(repayment);
    cursor = segmentEnd;
  }

  interest +=
    Math.max(0, outstanding) * monthlyRate * elapsedMonths(cursor, asOfDate);

  return roundMoney(interest);
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
  const paid = Math.max(0, amount);
  const interestComponent = roundMoney(
    Math.min(paid, summary.outstandingInterest)
  );
  const afterInterest = roundMoney(paid - interestComponent);
  const principalComponent = roundMoney(
    Math.min(afterInterest, summary.outstandingPrincipal)
  );
  const overpayment = roundMoney(afterInterest - principalComponent);

  return { interestComponent, principalComponent, overpayment };
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
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter a repayment amount greater than zero." };
  }

  const totalOutstanding = roundMoney(
    summary.outstandingPrincipal + summary.outstandingInterest
  );

  if (totalOutstanding <= 0) {
    return { ok: false, error: "This borrowing is already fully settled." };
  }

  if (amount > totalOutstanding && !options?.allowOverpayment) {
    return {
      ok: false,
      error: `Repayment exceeds the ${totalOutstanding} outstanding.`,
    };
  }

  return { ok: true };
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
