/**
 * The stored EPF summary, kept as absolute values — SPENDLY-653.
 *
 * `users/{uid}/financialSummaries/epf` feeds net worth, runway and the EPF
 * overview. SPENDLY-429 maintained it with Firestore `increment()` deltas, and
 * that drifted from the ledger in three ways:
 *
 *  1. Status transitions (mark credited / missed / reversed) sent no delta, so a
 *     month credited by hand never reached the overview.
 *  2. Transfers and the server-side cron never sent one either.
 *  3. Each delta was taken against a listener snapshot that could lag the write
 *     before it, so an effect re-run or a retry applied the same delta twice.
 *
 * Deltas can only be as right as every writer remembering them, exactly once.
 * So the document is now written whole: the same `calculateEpfSummary`
 * (`epfPortfolioSummary` → `establishmentBalanceBreakdown`) that the Balance tab
 * and the SPENDLY-499 rebuild already use. Writing it twice writes the same
 * thing, which is what makes a retry safe.
 *
 * Pure: `hooks/**` never runs under `npm test`.
 */

import type {
  EpfContribution,
  EpfEstablishment,
  EpfInterestEntry,
  EpfReconciliation,
  EpfTransfer,
} from "@/shared/features/epf/types";
import type { EpfSummary } from "@/shared/types/financialSummary";
import { calculateEpfSummary } from "@/shared/utils/reconciliation";

export interface EpfSummarySources {
  establishments: EpfEstablishment[];
  contributions: EpfContribution[];
  transfers: EpfTransfer[];
  interestEntries: EpfInterestEntry[];
  adjustments: EpfReconciliation[];
}

export const EPF_SUMMARY_VERSION = 2;

const MONEY_FIELDS = [
  "currentBalance",
  "employeeContributionTotal",
  "employerContributionTotal",
  "interestTotal",
  "adjustmentsTotal",
] as const;

type MoneyField = (typeof MONEY_FIELDS)[number];

export type EpfSummaryFields = Record<MoneyField, number> & {
  lastCreditPeriod: string | null;
  summaryVersion: number;
};

/** The whole stored document (minus `calculatedAt`) from source rows. */
export function epfSummaryFields(sources: EpfSummarySources): EpfSummaryFields {
  const calculated = calculateEpfSummary(sources);
  return {
    currentBalance: calculated.currentBalance ?? 0,
    employeeContributionTotal: calculated.employeeContributionTotal ?? 0,
    employerContributionTotal: calculated.employerContributionTotal ?? 0,
    interestTotal: calculated.interestTotal ?? 0,
    adjustmentsTotal: calculated.adjustmentsTotal ?? 0,
    lastCreditPeriod: calculated.lastCreditPeriod ?? null,
    summaryVersion: EPF_SUMMARY_VERSION,
  };
}

const sameMoney = (a: unknown, b: number) =>
  typeof a === "number" && Number.isFinite(a) && Math.abs(a - b) < 0.005;

/**
 * True when the stored document disagrees with `next`. A missing field counts
 * as a difference: an `increment()`-built doc never wrote a total that had not
 * moved yet (SPENDLY-544).
 */
export function epfSummaryNeedsWrite(
  stored: Partial<EpfSummary> | null | undefined,
  next: EpfSummaryFields
): boolean {
  if (!stored) return true;
  if (MONEY_FIELDS.some((field) => !sameMoney(stored[field], next[field]))) return true;
  if ((stored.lastCreditPeriod ?? null) !== next.lastCreditPeriod) return true;
  return stored.summaryVersion !== next.summaryVersion;
}

export type EpfSummarySyncDecision =
  | { write: false; reason: "not-ready" | "unconfirmed" | "in-sync" }
  | { write: true; fields: EpfSummaryFields };

/**
 * Whether the client should write the summary now.
 *
 * - `ready`: every source has delivered and none failed. A summary from a
 *   partial read is a wrong number written with confidence.
 * - `confirmed`: every source snapshot is server-backed (`fromCache: false`).
 *   An offline or just-reconnected device can hold a non-empty but incomplete
 *   cached collection; an absolute write from it would be queued and then
 *   overwrite the right value on sync. Display may use cache, a write may not.
 *
 * Once confirmed, an empty ledger is genuinely empty and its zero is written.
 */
export function decideEpfSummarySync(args: {
  ready: boolean;
  confirmed: boolean;
  stored: Partial<EpfSummary> | null | undefined;
  sources: EpfSummarySources;
}): EpfSummarySyncDecision {
  if (!args.ready) return { write: false, reason: "not-ready" };
  if (!args.confirmed) return { write: false, reason: "unconfirmed" };

  const fields = epfSummaryFields(args.sources);
  if (!epfSummaryNeedsWrite(args.stored, fields)) return { write: false, reason: "in-sync" };
  return { write: true, fields };
}

/**
 * Whether an outstanding write should still hold back a repeat — SPENDLY-653.
 *
 * The stored listener lags our own write by a round trip, so the same
 * document must not be re-sent in between. But suppression is only for that
 * window: once the stored document shows the pending fields, the write is
 * confirmed and the hold is released, so a later change (another device
 * writing a stale summary) is repaired instead of ignored for the whole mount.
 */
export function pendingSummaryWrite(
  pending: EpfSummaryFields | null,
  stored: Partial<EpfSummary> | null | undefined
): EpfSummaryFields | null {
  if (!pending) return null;
  return stored && !epfSummaryNeedsWrite(stored, pending) ? null : pending;
}
