import type { ContributionKind, ContributionStatus, GaneshContribution } from "@/shared/types/ganesh";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function contributionStatusOf(
  contribution?: Pick<GaneshContribution, "status"> | null
): ContributionStatus {
  if (contribution?.status === "received") return "received";
  if (contribution?.status === "cancelled") return "cancelled";
  return "promised";
}

export function isPromised(contribution?: Pick<GaneshContribution, "status" | "voided"> | null): boolean {
  return !contribution?.voided && contributionStatusOf(contribution) === "promised";
}

export function isReceived(contribution?: Pick<GaneshContribution, "status" | "voided"> | null): boolean {
  return !contribution?.voided && contributionStatusOf(contribution) === "received";
}

export function isCancelled(contribution?: Pick<GaneshContribution, "status" | "voided"> | null): boolean {
  return !contribution?.voided && contributionStatusOf(contribution) === "cancelled";
}

export function isOverdue(
  contribution?: Pick<GaneshContribution, "status" | "expectedDate" | "voided"> | null,
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
  contribution: Pick<GaneshContribution, "status" | "expectedDate" | "voided">,
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
