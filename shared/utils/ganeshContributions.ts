import type { ContributionKind, ContributionStatus, GaneshContribution } from "@/shared/types/ganesh";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import { money } from "@/shared/utils/ganeshMath";

type ContributionStatusFields = Pick<
  Partial<GaneshContribution>,
  "status" | "voided" | "expectedDate"
>;

export function contributionStatusOf(
  contribution?: Pick<ContributionStatusFields, "status"> | null
): ContributionStatus {
  if (contribution?.status === "received") return "received";
  if (contribution?.status === "cancelled") return "cancelled";
  return "promised";
}

export function isPromised(contribution?: ContributionStatusFields | null): boolean {
  return !contribution?.voided && contributionStatusOf(contribution) === "promised";
}

export function isReceived(contribution?: ContributionStatusFields | null): boolean {
  return !contribution?.voided && contributionStatusOf(contribution) === "received";
}

export function isCancelled(contribution?: ContributionStatusFields | null): boolean {
  return !contribution?.voided && contributionStatusOf(contribution) === "cancelled";
}

export function isOverdue(
  contribution?: ContributionStatusFields | null,
  today = todayDateInput()
): boolean {
  if (!isPromised(contribution)) return false;
  const expected = contribution?.expectedDate?.trim();
  if (!expected) return false;
  return expected < today;
}

export function contributionValue(contribution: Pick<GaneshContribution, "kind" | "amount" | "estimatedValue">): number {
  return contribution.kind === "money" ? contribution.amount || 0 : contribution.estimatedValue || 0;
}

export function isInKindKind(kind: ContributionKind): boolean {
  return kind === "item" || kind === "service";
}

export type ContributionTotals = {
  cashReceived: number;
  promisedCash: number;
  inKindReceived: number;
  promisedInKind: number;
  sponsoredReceived: number;
  cancelledValue: number;
  promisedCount: number;
  overdueCount: number;
  promisedSponsorCount: number;
};

export function summarizeContributions(
  rows: Array<
    Pick<
      GaneshContribution,
      "kind" | "amount" | "estimatedValue" | "status" | "expectedDate" | "voided"
    >
  >,
  today = todayDateInput()
): ContributionTotals {
  const totals: ContributionTotals = {
    cashReceived: 0,
    promisedCash: 0,
    inKindReceived: 0,
    promisedInKind: 0,
    sponsoredReceived: 0,
    cancelledValue: 0,
    promisedCount: 0,
    overdueCount: 0,
    promisedSponsorCount: 0,
  };

  for (const row of rows) {
    if (row.voided) continue;
    const value = contributionValue(row);
    if (isPromised(row)) {
      totals.promisedCount += 1;
      if (row.kind === "money") totals.promisedCash += value;
      else totals.promisedInKind += value;
      if (row.kind === "sponsorship") totals.promisedSponsorCount += 1;
      if (isOverdue(row, today)) totals.overdueCount += 1;
    } else if (isReceived(row)) {
      if (row.kind === "money") totals.cashReceived += value;
      else if (row.kind === "sponsorship") totals.sponsoredReceived += value;
      else totals.inKindReceived += value;
    } else if (isCancelled(row)) {
      totals.cancelledValue += value;
    }
  }

  return {
    cashReceived: money(totals.cashReceived),
    promisedCash: money(totals.promisedCash),
    inKindReceived: money(totals.inKindReceived),
    promisedInKind: money(totals.promisedInKind),
    sponsoredReceived: money(totals.sponsoredReceived),
    cancelledValue: money(totals.cancelledValue),
    promisedCount: totals.promisedCount,
    overdueCount: totals.overdueCount,
    promisedSponsorCount: totals.promisedSponsorCount,
  };
}

export function contributionStatusLabel(
  contribution: ContributionStatusFields,
  today = todayDateInput()
): "promised" | "received" | "cancelled" | "overdue" {
  if (isOverdue(contribution, today)) return "overdue";
  return contributionStatusOf(contribution);
}

export function assertCanReceiveContribution(prev: {
  status?: ContributionStatus | string;
  voided?: boolean;
}): void {
  if (prev.voided) throw new Error("This contribution is already voided.");
  if (prev.status === "received") throw new Error("This contribution is already received.");
  if (prev.status === "cancelled") throw new Error("A cancelled contribution cannot be marked received.");
  if (prev.status !== "promised") throw new Error("Only a promised contribution can be marked received.");
}

export function assertCanCancelContribution(prev: {
  status?: ContributionStatus | string;
  voided?: boolean;
}): void {
  if (prev.voided) throw new Error("This contribution is already voided.");
  if (prev.status === "cancelled") throw new Error("This contribution is already cancelled.");
  if (prev.status === "received") {
    throw new Error("A received contribution cannot be cancelled. Void it if the cash was recorded in error.");
  }
  if (prev.status !== "promised") throw new Error("Only a promised contribution can be cancelled.");
}

export const MONEY_RECEIVE_OFFLINE_ERROR =
  "Mark money received when you are online so cash is recorded once.";

export function assertMoneyReceiveOnline(isOnline: boolean, kind: string): void {
  if (kind === "money" && !isOnline) throw new Error(MONEY_RECEIVE_OFFLINE_ERROR);
}

export const GOD_FUND_SPEND_OFFLINE_ERROR =
  "Spend God Fund money when you are online, so the balance is checked against the live ledger.";

export const LEDGER_VOID_OFFLINE_ERROR =
  "Void a record when you are online, so the balances it reverses are corrected against the live ledger.";

export const REIMBURSEMENT_OFFLINE_ERROR =
  "Record a reimbursement when you are online, so the amount owed is checked against the live ledger.";

export const PROMISE_CANCEL_OFFLINE_ERROR =
  "Cancel a promise when you are online, so it is withdrawn from the promised total once.";

/**
 * The gates below front write paths that run inside a Firestore transaction,
 * because a balance has to be read and enforced with nothing committing in
 * between. Transactions need a server, so refuse offline with a reason rather
 * than letting the save hang or queueing a write that can never commit.
 *
 * God Fund spending is gated only when it actually spends: an expense paid
 * entirely from personal money or by a sponsor touches no balance, stays a
 * plain batch, and keeps working offline.
 */
export function assertGodFundSpendOnline(isOnline: boolean, godFundAmount: number): void {
  if (godFundAmount > 0 && !isOnline) throw new Error(GOD_FUND_SPEND_OFFLINE_ERROR);
}

export function assertVoidOnline(isOnline: boolean): void {
  if (!isOnline) throw new Error(LEDGER_VOID_OFFLINE_ERROR);
}

export function assertReimbursementOnline(isOnline: boolean): void {
  if (!isOnline) throw new Error(REIMBURSEMENT_OFFLINE_ERROR);
}

export function assertPromiseCancelOnline(isOnline: boolean): void {
  if (!isOnline) throw new Error(PROMISE_CANCEL_OFFLINE_ERROR);
}
