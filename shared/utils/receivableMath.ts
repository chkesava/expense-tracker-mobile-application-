/**
 * Pure receivable math: outstanding balance, status and portfolio totals.
 *
 * No interest in v1. Nothing here touches Firebase or React Native.
 */

import type {
  Receivable,
  ReceivableRepayment,
  ReceivableStatus,
} from "../types/receivable";

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
  totalReceived: number;
  outstandingAmount: number;
  status: ReceivableStatus;
  settledDate: string | null;
  isOverdue: boolean;
  repaymentCount: number;
}

function deriveStatus(params: {
  storedStatus: ReceivableStatus;
  outstandingAmount: number;
  totalReceived: number;
  isOverdue: boolean;
}): ReceivableStatus {
  // A manual cancel is a deliberate user decision and outranks derivation.
  if (params.storedStatus === "CANCELLED") return "CANCELLED";
  if (params.outstandingAmount <= 0) return "FULLY_SETTLED";
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
  const outstandingAmount = roundMoney(
    Math.max(0, receivable.originalAmount - totalReceived)
  );

  const isSettled = outstandingAmount <= 0;
  const isOverdue = Boolean(
    receivable.dueDate && asOfDate > receivable.dueDate && !isSettled
  );

  const status = deriveStatus({
    storedStatus: receivable.status,
    outstandingAmount,
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
    totalReceived,
    outstandingAmount,
    status,
    settledDate,
    isOverdue,
    repaymentCount: relevant.length,
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
  totalOutstanding: number;
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
      if (summary.status === "OVERDUE") acc.overdueCount += 1;
      return acc;
    },
    {
      totalLent: 0,
      totalReceived: 0,
      totalOutstanding: 0,
      activeCount: 0,
      settledCount: 0,
      overdueCount: 0,
      cancelledCount: 0,
    }
  );
}

/** Receivables assigned to a Space. Unassigned are always excluded. */
export function receivablesInSpace(
  receivables: Receivable[],
  spaceId: string
): Receivable[] {
  if (!spaceId) return [];
  return receivables.filter((r) => r.spaceId === spaceId);
}
