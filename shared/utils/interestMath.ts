/**
 * Direction-agnostic simple-interest engine.
 *
 * Extracted from `borrowingMath.ts` (SPENDLY-160) when money lent gained
 * interest too, so both sides accrue through one implementation. Knows nothing
 * about borrowings, receivables, Firebase or React Native.
 *
 * The bodies below were moved character-for-character; only field accesses
 * changed. The borrowing engine's public API is unchanged and its tests were
 * not touched, which is the evidence that the move preserved behaviour.
 *
 * Deliberately NOT here: status derivation, settled dates, overdue, portfolio
 * rollups, denormalized cache field names. Those genuinely differ between the
 * two domains (`CLOSED` vs `CANCELLED`, `dueThisMonthAmount` exists only on
 * receivables) and generalising them would earn nothing.
 */

import type { InterestTerms } from "../types/interest";
export type { InterestTerms };
import { daysInMonth, parseLocalDate } from "./dates";
import { roundMoney } from "./money";

/** Guards against runaway loops on absurd date ranges (200 years). */
const MAX_MONTH_STEPS = 2400;

/** A principal balance that starts accruing on `startDate`. */
export interface InterestPosition {
  principal: number;
  /** YYYY-MM-DD */
  startDate: string;
  terms: InterestTerms;
}

/**
 * A payment's effect on the accruing balance. Interest components are
 * irrelevant to accrual, so the core only ever sees principal.
 */
export interface PrincipalMovement {
  /** YYYY-MM-DD */
  date: string;
  principalComponent: number;
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
export function monthlyRateOf(terms: InterestTerms): number {
  if (terms.type === "NONE") return 0;
  const rate = terms.rate;
  if (!Number.isFinite(rate) || rate <= 0) return 0;

  switch (terms.frequency) {
    case "MONTHLY":
      return rate / 100;
    case "ANNUAL":
      return rate / 100 / 12;
    default:
      return 0;
  }
}

/** Chronological, dropping anything after `asOfDate`. */
export function movementsUpTo<T extends { date: string }>(
  movements: T[],
  asOfDate: string
): T[] {
  return movements
    .filter((m) => m.date <= asOfDate)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Interest accrued between `position.startDate` and `asOfDate`.
 *
 * With an `OUTSTANDING_PRINCIPAL` basis the timeline is split at every movement
 * so each segment charges only what was actually owed then. Segments are summed
 * unrounded and rounded once at the end — rounding per segment would drift by
 * rupees over a long position, and the borrowing suite pins the difference.
 *
 * Callers filter movements to their own instrument first.
 */
export function accrueInterest(
  position: InterestPosition,
  movements: PrincipalMovement[],
  asOfDate: string
): number {
  if (position.terms.type === "NONE") return 0;
  if (asOfDate < position.startDate) return 0;

  if (position.terms.frequency === "ONE_TIME") {
    const rate = position.terms.rate;
    if (!Number.isFinite(rate) || rate <= 0) return 0;
    return roundMoney((position.principal * rate) / 100);
  }

  const monthlyRate = monthlyRateOf(position.terms);
  if (monthlyRate <= 0) return 0;

  if (position.terms.basis === "ORIGINAL_PRINCIPAL") {
    const months = elapsedMonths(position.startDate, asOfDate);
    return roundMoney(position.principal * monthlyRate * months);
  }

  const relevant = movementsUpTo(movements, asOfDate);

  let cursor = position.startDate;
  let outstanding = position.principal;
  let interest = 0;

  for (const movement of relevant) {
    const segmentEnd = movement.date < cursor ? cursor : movement.date;
    interest +=
      Math.max(0, outstanding) * monthlyRate * elapsedMonths(cursor, segmentEnd);
    outstanding -= movement.principalComponent;
    cursor = segmentEnd;
  }

  interest +=
    Math.max(0, outstanding) * monthlyRate * elapsedMonths(cursor, asOfDate);

  return roundMoney(interest);
}

/** Short human label for an interest configuration. */
export function describeInterestTerms(terms: InterestTerms): string {
  if (terms.type === "NONE" || terms.frequency === "NONE") {
    return "No interest";
  }
  if (!Number.isFinite(terms.rate) || terms.rate <= 0) {
    return "No interest";
  }

  const rate = `${terms.rate}%`;
  switch (terms.frequency) {
    case "MONTHLY":
      return `${rate} monthly interest`;
    case "ANNUAL":
      return `${rate} annual interest`;
    case "ONE_TIME":
      return `${rate} one-time interest`;
    default:
      return "No interest";
  }
}

export interface OwedSplit {
  outstandingPrincipal: number;
  outstandingInterest: number;
}

export interface PaymentAllocation {
  interestComponent: number;
  principalComponent: number;
  /** Anything beyond what is owed. Non-zero only when overpayment is allowed. */
  overpayment: number;
}

/** Interest is cleared before principal, the conventional order. */
export function allocateInterestFirst(
  amount: number,
  owed: OwedSplit
): PaymentAllocation {
  const paid = Math.max(0, amount);
  const interestComponent = roundMoney(Math.min(paid, owed.outstandingInterest));
  const afterInterest = roundMoney(paid - interestComponent);
  const principalComponent = roundMoney(
    Math.min(afterInterest, owed.outstandingPrincipal)
  );
  const overpayment = roundMoney(afterInterest - principalComponent);

  return { interestComponent, principalComponent, overpayment };
}

export interface PaymentValidation {
  ok: boolean;
  error?: string;
}

/**
 * Blocks accidental overpayment unless the caller opts in explicitly.
 *
 * `subject` only shapes the error copy, so each side keeps the exact wording it
 * already showed ("This borrowing is already fully settled.").
 */
export function validatePayment(
  amount: number,
  owed: OwedSplit,
  options?: { allowOverpayment?: boolean; subject?: string }
): PaymentValidation {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter a repayment amount greater than zero." };
  }

  const totalOutstanding = roundMoney(
    owed.outstandingPrincipal + owed.outstandingInterest
  );

  if (totalOutstanding <= 0) {
    return {
      ok: false,
      error: `This ${options?.subject ?? "balance"} is already fully settled.`,
    };
  }

  if (amount > totalOutstanding && !options?.allowOverpayment) {
    return {
      ok: false,
      error: `Repayment exceeds the ${totalOutstanding} outstanding.`,
    };
  }

  return { ok: true };
}
