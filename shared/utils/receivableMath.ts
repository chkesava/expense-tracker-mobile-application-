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
  ReceivableLend,
  ReceivableRepayment,
  ReceivableStatus,
} from "../types/receivable";
import { receivableInterestTerms } from "../types/receivable";
import {
  accrueInterest,
  allocateInterestFirst,
  cacheStampDate,
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

/**
 * Interest accrued on money lent, between the lent date and `asOfDate`.
 *
 * SPENDLY-792: a later lend (`ReceivableLend`) earns interest only from its
 * own date. On the outstanding-principal basis it is a movement that raises
 * what is owed from that day; on the original-principal basis and for
 * one-time interest it is its own tranche, charged from its own date.
 */
export function computeAccruedInterest(
  receivable: Receivable,
  repayments: ReceivableRepayment[],
  asOfDate: string,
  lends: ReceivableLend[] = []
): number {
  const terms = receivableInterestTerms(receivable);
  const endDate = accrualEndDate(receivable, asOfDate);
  const extraLends = lendsFor(receivable.id, lends);

  if (
    extraLends.length > 0 &&
    (terms.frequency === "ONE_TIME" || terms.basis === "ORIGINAL_PRINCIPAL")
  ) {
    const tranches = [
      { principal: receivable.originalAmount, startDate: receivable.lentDate },
      ...extraLends.map((l) => ({ principal: l.amount, startDate: l.date })),
    ];
    return roundMoney(
      tranches.reduce(
        (sum, t) => sum + accrueInterest({ ...t, terms }, [], endDate),
        0
      )
    );
  }

  const movements = [
    ...repaymentsFor(receivable.id, repayments).map((r) => ({
      date: r.date,
      principalComponent: principalComponentOf(r),
    })),
    ...extraLends.map((l) => ({ date: l.date, principalComponent: -l.amount })),
  ];
  return accrueInterest(
    {
      principal: receivable.originalAmount,
      startDate: receivable.lentDate,
      terms,
    },
    movements,
    endDate
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

/** SPENDLY-792: the later lends recorded against one receivable. */
export function lendsFor(
  receivableId: string | undefined,
  lends: ReceivableLend[]
): ReceivableLend[] {
  if (!receivableId) return [];
  return lends.filter((l) => l.receivableId === receivableId);
}

/** Sum of the later lends dated on or before `asOfDate`. */
function additionalLentUpTo(lends: ReceivableLend[], asOfDate: string): number {
  return roundMoney(
    lends
      .filter((l) => l.date <= asOfDate)
      .reduce((sum, l) => sum + (l.amount || 0), 0)
  );
}

/**
 * SPENDLY-792: the principal lent to this person so far — the first lend plus
 * every later lend dated on or before `asOfDate`.
 */
export function receivablePrincipalLent(
  receivable: Pick<Receivable, "id" | "originalAmount">,
  lends: ReceivableLend[],
  asOfDate: string
): number {
  return roundMoney(
    receivable.originalAmount +
      additionalLentUpTo(lendsFor(receivable.id, lends), asOfDate)
  );
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

/**
 * SPENDLY-605: the as-of date for stamping this receivable's stored cache, so
 * the cache counts every recorded repayment, including one dated after today.
 */
export function receivableCacheAsOfDate(
  receivableId: string | undefined,
  repayments: ReceivableRepayment[],
  today: string,
  lends: ReceivableLend[] = []
): string {
  return cacheStampDate(today, [
    ...repaymentsFor(receivableId, repayments),
    ...lendsFor(receivableId, lends),
  ]);
}

export interface ReceivableRepaymentTotals {
  totalReceived: number;
  principalReceived: number;
}

/** Per-receivable sums of every repayment row, built once per pass. */
export function receivableRepaymentTotals(
  repayments: ReceivableRepayment[]
): Map<string, ReceivableRepaymentTotals> {
  const totals = new Map<string, ReceivableRepaymentTotals>();
  for (const r of repayments) {
    if (!r.receivableId) continue;
    const t = totals.get(r.receivableId) ?? {
      totalReceived: 0,
      principalReceived: 0,
    };
    t.totalReceived = roundMoney(t.totalReceived + (r.amount || 0));
    t.principalReceived = roundMoney(t.principalReceived + principalComponentOf(r));
    totals.set(r.receivableId, t);
  }
  return totals;
}

/** SPENDLY-792: per-receivable sums of every later-lend row. */
export function receivableLendTotals(
  lends: ReceivableLend[]
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const l of lends) {
    if (!l.receivableId) continue;
    totals.set(
      l.receivableId,
      roundMoney((totals.get(l.receivableId) ?? 0) + (l.amount || 0))
    );
  }
  return totals;
}

/**
 * SPENDLY-605: true when the stored cache disagrees with the repayment rows,
 * so the SPENDLY-434 fast path must not be trusted for this receivable.
 *
 * Only a receivable that has rows can be judged: the repayment listener
 * mounts after the parents and delivers its whole set at once, so "no rows
 * yet" means "not loaded", not "nothing received". The same holds for the
 * later-lend rows (SPENDLY-792): with none loaded, the cached
 * `additionalLent` stands in for them.
 */
export function receivableCacheDrifted(
  receivable: Receivable,
  totals: Map<string, ReceivableRepaymentTotals>,
  lendTotals: Map<string, number> = new Map()
): boolean {
  const lent = receivable.id ? lendTotals.get(receivable.id) : undefined;
  if (lent !== undefined && roundMoney(receivable.additionalLent ?? 0) !== lent) {
    return true;
  }
  const rows = receivable.id ? totals.get(receivable.id) : undefined;
  if (!rows) return false;
  if (roundMoney(receivable.totalReceived ?? 0) !== rows.totalReceived) {
    return true;
  }
  if ((receivable.interestRate || 0) === 0) {
    const principalLent =
      receivable.originalAmount + (lent ?? receivable.additionalLent ?? 0);
    const expected = roundMoney(
      Math.max(0, principalLent - rows.principalReceived)
    );
    if (roundMoney(receivable.outstandingAmount ?? 0) !== expected) return true;
  }
  return false;
}

export interface ReceivableSummary {
  receivableId: string;
  originalAmount: number;
  /** Later lends to the same person, up to the as-of date (SPENDLY-792). */
  additionalLent: number;
  /** `originalAmount + additionalLent`: all principal lent so far. */
  principalLent: number;
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

/**
 * Authoritative derived view of one receivable.
 *
 * `lends` are the later lends to the same person (SPENDLY-792). Every caller
 * that has them must pass them: without them the principal owed is only the
 * first lend.
 */
export function summarizeReceivable(
  receivable: Receivable,
  repayments: ReceivableRepayment[],
  asOfDate: string,
  lends: ReceivableLend[] = []
): ReceivableSummary {
  const relevant = repaymentsUpTo(
    repaymentsFor(receivable.id, repayments),
    asOfDate
  );
  const additionalLent = additionalLentUpTo(
    lendsFor(receivable.id, lends),
    asOfDate
  );
  const principalLent = roundMoney(receivable.originalAmount + additionalLent);

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
    Math.max(0, principalLent - principalReceived)
  );
  const interestAccrued = computeAccruedInterest(
    receivable,
    repayments,
    asOfDate,
    lends
  );
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
    additionalLent,
    principalLent,
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
    additionalLent: summary.additionalLent,
    outstandingAmount: summary.outstandingAmount,
    accruedInterest: summary.interestAccrued,
    principalReceived: summary.principalReceived,
    interestReceived: summary.interestReceived,
    interestWaived: summary.interestWaived,
    outstandingPrincipal: summary.outstandingPrincipal,
    outstandingInterest: summary.outstandingInterest,
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
  asOfDate: string,
  lends: ReceivableLend[] = []
): ReceivableUpdatePayloadResult {
  const current = summarizeReceivable(existing, repayments, asOfDate, lends);
  // SPENDLY-792: later lends also cover principal already received, so the
  // first lend only has to cover what they don't.
  const floor = roundMoney(
    Math.max(0, current.principalReceived - current.additionalLent)
  );
  if (updates.originalAmount != null && updates.originalAmount < floor) {
    return {
      ok: false,
      error: `Amount cannot be less than ${floor} already received.`,
    };
  }
  const newLentDate = updates.lentDate;
  if (
    newLentDate &&
    lendsFor(existing.id, lends).some((l) => l.date < newLentDate)
  ) {
    return {
      ok: false,
      error: "The lent date cannot be after a later lend to this person.",
    };
  }

  if (!receivableUpdateAffectsSummary(updates)) {
    return { ok: true, fields: { ...updates }, recomputed: false };
  }

  const next = summarizeReceivable(
    { ...existing, ...updates },
    repayments,
    receivableCacheAsOfDate(existing.id, repayments, asOfDate, lends),
    lends
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

/**
 * SPENDLY-792: checks a later lend before it is written. Refuses a cancelled
 * receivable, a non-positive amount, a date in the future (it would debit an
 * account before the money moved) and a date before the first lend.
 */
export function validateReceivableLend(
  input: { amount: number; date: string },
  receivable: Pick<Receivable, "status" | "lentDate">,
  today: string
): RepaymentValidation {
  if (receivable.status === "CANCELLED") {
    return { ok: false, error: "This receivable was cancelled." };
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { ok: false, error: "Pick the date the money was lent." };
  }
  if (input.date > today) {
    return { ok: false, error: "The date cannot be in the future." };
  }
  if (input.date < receivable.lentDate) {
    return {
      ok: false,
      error: "The date cannot be before the first lend to this person.",
    };
  }
  return { ok: true };
}

/**
 * SPENDLY-792: removing a later lend must not leave more principal received
 * than was lent.
 */
export function validateReceivableLendDelete(
  receivable: Receivable,
  lendId: string,
  repayments: ReceivableRepayment[],
  lends: ReceivableLend[],
  asOfDate: string
): RepaymentValidation {
  const remaining = lends.filter((l) => l.id !== lendId);
  const after = summarizeReceivable(
    receivable,
    repayments,
    receivableCacheAsOfDate(receivable.id, repayments, asOfDate, remaining),
    remaining
  );
  if (after.principalReceived > after.principalLent) {
    return {
      ok: false,
      error: `${after.principalReceived} has already been received, more than would be left lent. Remove a repayment first.`,
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
  asOfDate: string,
  lends: ReceivableLend[] = []
): ReceivablePortfolioSummary {
  const totals = receivableRepaymentTotals(repayments);
  const lendTotals = receivableLendTotals(lends);
  return receivables.reduce<ReceivablePortfolioSummary>(
    (acc, receivable) => {
      // SPENDLY-434: Fast path using materialized fields.
      let principalLent =
        receivable.originalAmount + (receivable.additionalLent ?? 0);
      let totalReceived = receivable.totalReceived;
      let interestAccrued = receivable.accruedInterest;
      let outstandingAmount = receivable.outstandingAmount;
      let status = receivable.status;

      if (
        totalReceived === undefined ||
        outstandingAmount === undefined ||
        (receivable.interestRate || 0) > 0 ||
        receivableCacheDrifted(receivable, totals, lendTotals)
      ) {
        // Fallback for non-backfilled records, dynamic interest accrual, or a
        // cache that disagrees with its repayment rows (SPENDLY-605)
        const summary = summarizeReceivable(
          receivable,
          repayments,
          asOfDate,
          lends
        );
        principalLent = summary.principalLent;
        totalReceived = summary.totalReceived;
        interestAccrued = summary.interestAccrued;
        outstandingAmount = summary.outstandingAmount;
        status = summary.status;
      }

      acc.totalLent = roundMoney(acc.totalLent + principalLent);
      acc.totalReceived = roundMoney(acc.totalReceived + (totalReceived || 0));
      acc.totalInterest = roundMoney(acc.totalInterest + (interestAccrued || 0));
      if (status !== "CANCELLED") {
        acc.totalOutstanding = roundMoney(
          acc.totalOutstanding + (outstandingAmount || 0)
        );
      }
      if (status === "FULLY_SETTLED") {
        acc.settledCount += 1;
      } else if (status === "CANCELLED") {
        acc.cancelledCount += 1;
      } else {
        acc.activeCount += 1;
      }
      if (status === "OVERDUE") {
        acc.overdueCount += 1;
        acc.overdueAmount = roundMoney(
          acc.overdueAmount + (outstandingAmount || 0)
        );
      } else if (
        status !== "CANCELLED" &&
        status !== "FULLY_SETTLED" &&
        isDueInMonthOf(receivable.dueDate, asOfDate)
      ) {
        // Overdue is its own bucket, so this stays "still to come this month"
        // rather than double-counting money that is already late.
        acc.dueThisMonthAmount = roundMoney(
          acc.dueThisMonthAmount + (outstandingAmount || 0)
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
