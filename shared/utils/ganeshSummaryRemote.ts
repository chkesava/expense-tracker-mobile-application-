/**
 * HTTP contract for the Netlify festival-summary function (KAN-36).
 *
 * Cloud Functions need Blaze. This repo already hosts spendly-share on
 * Netlify, so the trusted rebuild lives there instead. The function still
 * writes with the Admin SDK; the client only asks.
 */

import type { GaneshSummary } from "@/shared/types/ganesh";
import { festivalCashSpent, totalCashIn } from "@/shared/utils/ganeshMath";

export type SummaryRemoteMode = "rebuild" | "seed" | "recompute";

export type SummaryRebuildLedgerSignals = {
  collectionCount: number;
  receivedMoneyContributionCount: number;
  expenseCount: number;
  fundTransferCount: number;
  openingFundCount: number;
};

export function ganeshSummaryFunctionUrl(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return base ? `${base}/.netlify/functions/ganesh-summary` : "";
}

export function parseSummaryRemoteMode(value: unknown): SummaryRemoteMode | null {
  if (value === "rebuild" || value === "seed" || value === "recompute") return value;
  return null;
}

/**
 * Mirrors the old Cloud Function checks. Rebuild is allowed for any active
 * member because it recomputes from the ledger — they cannot choose a total.
 */
export function canRequestFestivalSummary(
  mode: SummaryRemoteMode,
  member: { status?: unknown; role?: unknown; permissions?: unknown } | null | undefined
): boolean {
  if (!member || member.status !== "active") return false;
  if (mode === "rebuild") return true;

  const role = typeof member.role === "string" ? member.role : "";
  const permissions = member.permissions;
  const has = (perm: string) => (Array.isArray(permissions) ? permissions.includes(perm) : false);
  const isAdmin = role === "admin";

  if (mode === "seed") return isAdmin || has("festival.create");
  return isAdmin || has("festival.update") || (!Array.isArray(permissions) && role === "treasurer");
}

/**
 * True when `summary/totals` is still empty of money but the live ledger is not.
 *
 * After a Netlify rebuild failure the activity feed still shows collections and
 * contributions (those docs are client-written) while Home/Funds stay at ₹0.
 * Callers should POST a rebuild once, not on every render.
 */
export function festivalSummaryNeedsRebuild(
  summary: Pick<
    GaneshSummary,
    | "openingFunds"
    | "chanda"
    | "committeeContributions"
    | "otherCashContributions"
    | "godFundExpenses"
    | "reimbursements"
    | "collectionCount"
    | "expenseCount"
  > & { receivedFromPermanentFund?: number; transferredToPermanentFund?: number },
  ledger: SummaryRebuildLedgerSignals
): boolean {
  const summaryEmpty =
    totalCashIn(summary) === 0 &&
    festivalCashSpent(summary) === 0 &&
    summary.collectionCount === 0 &&
    summary.expenseCount === 0 &&
    (summary.receivedFromPermanentFund ?? 0) === 0 &&
    (summary.transferredToPermanentFund ?? 0) === 0;
  const ledgerHasMoney =
    ledger.collectionCount > 0 ||
    ledger.receivedMoneyContributionCount > 0 ||
    ledger.expenseCount > 0 ||
    ledger.fundTransferCount > 0 ||
    ledger.openingFundCount > 0;
  return summaryEmpty && ledgerHasMoney;
}
