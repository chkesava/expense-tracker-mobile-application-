/**
 * EPF totals across every establishment under one UAN — KAN-71.
 *
 * Everything before this ticket was per-establishment, so a person with three
 * employers saw three numbers and no sum. This aggregates them.
 *
 * No new arithmetic: it sums `establishmentBalanceBreakdown`, the definition
 * settled in KAN-69 and extended in KAN-70. Re-deriving a balance here would
 * have been the third competing version of the same number.
 *
 * Pure by necessity — `hooks/**` and `components/**` never run under `npm test`.
 */

import type {
  EpfContribution,
  EpfEstablishment,
  EpfInterestEntry,
  EpfReconciliation,
  EpfTransfer,
} from "@/shared/features/epf/types";
import { isReconciled } from "@/shared/features/epf/utils/lifecycle";
import { establishmentBalanceBreakdown } from "@/shared/features/epf/utils/transfers";
import { roundMoney } from "@/shared/utils/money";

/** Contribution statuses that actually added money. Mirrors the balance definition. */
const BALANCE_BEARING: EpfContribution["status"][] = ["credited", "partial", "confirmed"];

export interface EpfPortfolioSummary {
  /** Everything held across every establishment. */
  total: number;

  // --- what makes up the balance ---
  /** The member's own share. */
  employeeShare: number;
  /** The employer's share that reached the fund — not their full remittance. */
  employerEpfShare: number;
  interest: number;
  /** Completed transfers in minus out. Nets to zero for internal moves. */
  netTransfers: number;
  adjustments: number;

  /**
   * Diverted to the pension scheme.
   *
   * Reported for completeness and **excluded from `total`** — EPS is not part of
   * the provident fund balance. Conflating the two is precisely the error
   * KAN-66 introduced `epfCredit` to prevent.
   */
  epsShare: number;

  // --- how much of this is a projection ---
  /** Credited or partial months the user has not confirmed against a passbook. */
  unreconciledCount: number;
  /** Most recent reconciliation date across all establishments, if any. */
  lastReconciledAt: string | null;
  /** True while any part of the total is unconfirmed. */
  simulated: boolean;

  establishmentCount: number;
}

const EMPTY: EpfPortfolioSummary = {
  total: 0,
  employeeShare: 0,
  employerEpfShare: 0,
  interest: 0,
  netTransfers: 0,
  adjustments: 0,
  epsShare: 0,
  unreconciledCount: 0,
  lastReconciledAt: null,
  simulated: false,
  establishmentCount: 0,
};

/**
 * Totals across the whole UAN.
 *
 * Archived establishments are **included**: archiving hides an employer from
 * the working list, it does not delete its money, and a total that quietly
 * dropped it would be wrong.
 */
export function epfPortfolioSummary(args: {
  establishments: EpfEstablishment[];
  contributions: EpfContribution[];
  transfers: EpfTransfer[];
  interestEntries: EpfInterestEntry[];
  adjustments: EpfReconciliation[];
}): EpfPortfolioSummary {
  const { establishments, contributions, transfers, interestEntries, adjustments } = args;
  if (establishments.length === 0) return { ...EMPTY };

  const summary: EpfPortfolioSummary = { ...EMPTY, establishmentCount: establishments.length };

  for (const establishment of establishments) {
    const breakdown = establishmentBalanceBreakdown({
      contributions,
      transfers,
      establishmentId: establishment.id,
      interestEntries,
      adjustments,
    });

    summary.total += breakdown.total;
    summary.interest += breakdown.interest;
    summary.netTransfers += breakdown.transfersIn - breakdown.transfersOut;
    summary.adjustments += breakdown.adjustments;
  }

  // The contribution-type split is not part of the balance breakdown, because
  // the balance only cares what landed. The ticket asks for it explicitly.
  for (const row of contributions) {
    if (!BALANCE_BEARING.includes(row.status)) continue;

    if (row.creditedAmount !== undefined && row.epfCredit > 0) {
      // A reconciled month may differ from the projection; scale the split so
      // the parts still sum to what actually landed.
      const ratio = row.creditedAmount / row.epfCredit;
      summary.employeeShare += row.employeeShare * ratio;
      summary.employerEpfShare += row.employerEpfShare * ratio;
    } else {
      summary.employeeShare += row.employeeShare;
      summary.employerEpfShare += row.employerEpfShare;
    }
    summary.epsShare += row.epsShare;

    if (!isReconciled(row)) summary.unreconciledCount += 1;
  }

  const reconciledDates = adjustments.map((row) => row.date).sort();
  summary.lastReconciledAt = reconciledDates[reconciledDates.length - 1] ?? null;
  summary.simulated = summary.unreconciledCount > 0;

  summary.total = roundMoney(summary.total);
  summary.employeeShare = roundMoney(summary.employeeShare);
  summary.employerEpfShare = roundMoney(summary.employerEpfShare);
  summary.interest = roundMoney(summary.interest);
  summary.netTransfers = roundMoney(summary.netTransfers);
  summary.adjustments = roundMoney(summary.adjustments);
  summary.epsShare = roundMoney(summary.epsShare);

  return summary;
}
