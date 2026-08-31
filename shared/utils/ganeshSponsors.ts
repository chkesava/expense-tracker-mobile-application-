import type {
  GaneshSponsorship,
  PandalSponsor,
  SponsoringType,
  SponsorshipPurpose,
  SponsorshipStatus,
} from "@/shared/types/ganesh";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import { money } from "@/shared/utils/ganeshMath";

export const SPONSOR_TYPES = [
  { id: "person" as const, label: "Person" },
  { id: "business" as const, label: "Business" },
  { id: "organization" as const, label: "Organization" },
  { id: "other" as const, label: "Other" },
];

export const SPONSORING_TYPES = [
  { id: "cash" as const, label: "Cash" },
  { id: "item" as const, label: "Item" },
  { id: "service" as const, label: "Service" },
  { id: "expense" as const, label: "Expense" },
];

export const SPONSORSHIP_PURPOSES = [
  { id: "ganesh_idol" as const, label: "Ganesh Idol" },
  { id: "decoration" as const, label: "Decoration" },
  { id: "sound" as const, label: "Sound System" },
  { id: "lighting" as const, label: "Lighting" },
  { id: "prasadam" as const, label: "Prasadam" },
  { id: "food" as const, label: "Food" },
  { id: "pooja" as const, label: "Pooja Materials" },
  { id: "immersion" as const, label: "Immersion" },
  { id: "cultural" as const, label: "Cultural Program" },
  { id: "other" as const, label: "Other" },
];

export const SPONSORSHIP_STATUSES = [
  { id: "prospective" as const, label: "Prospective" },
  { id: "promised" as const, label: "Promised" },
  { id: "confirmed" as const, label: "Confirmed" },
  { id: "received" as const, label: "Received" },
  { id: "cancelled" as const, label: "Cancelled" },
];

export function sponsorshipStatusOf(
  row?: Pick<GaneshSponsorship, "status"> | null
): SponsorshipStatus {
  if (row?.status === "promised") return "promised";
  if (row?.status === "confirmed") return "confirmed";
  if (row?.status === "received") return "received";
  if (row?.status === "cancelled") return "cancelled";
  return "prospective";
}

export function isProspective(row?: Pick<GaneshSponsorship, "status"> | null): boolean {
  return sponsorshipStatusOf(row) === "prospective";
}

export function isPromisedSponsorship(row?: Pick<GaneshSponsorship, "status"> | null): boolean {
  return sponsorshipStatusOf(row) === "promised";
}

export function isConfirmed(row?: Pick<GaneshSponsorship, "status"> | null): boolean {
  return sponsorshipStatusOf(row) === "confirmed";
}

export function isReceivedSponsorship(row?: Pick<GaneshSponsorship, "status"> | null): boolean {
  return sponsorshipStatusOf(row) === "received";
}

export function isCancelledSponsorship(row?: Pick<GaneshSponsorship, "status"> | null): boolean {
  return sponsorshipStatusOf(row) === "cancelled";
}

export function isOpenSponsorship(row?: Pick<GaneshSponsorship, "status"> | null): boolean {
  const status = sponsorshipStatusOf(row);
  return status === "prospective" || status === "promised" || status === "confirmed";
}

function expectedDateOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isSponsorshipOverdue(
  row?: Pick<GaneshSponsorship, "status" | "expectedDate"> | null,
  today = todayDateInput()
): boolean {
  if (!isPromisedSponsorship(row)) return false;
  const expected = expectedDateOf(row?.expectedDate);
  if (!expected) return false;
  return expected < today;
}

export function sponsorshipValue(
  row: Pick<GaneshSponsorship, "sponsoringType" | "amount" | "estimatedValue">
): number {
  return row.sponsoringType === "cash" || row.sponsoringType === "expense"
    ? row.amount || 0
    : row.estimatedValue || 0;
}

export function isInKindSponsoring(type: SponsoringType): boolean {
  return type === "item" || type === "service";
}

export function purposeLabelOf(
  purpose: SponsorshipPurpose,
  custom?: string
): string {
  if (custom?.trim()) return custom.trim();
  return SPONSORSHIP_PURPOSES.find((item) => item.id === purpose)?.label ?? purpose;
}

export function sponsorshipStatusLabel(
  row: Pick<GaneshSponsorship, "status" | "expectedDate">,
  today = todayDateInput()
): SponsorshipStatus | "overdue" {
  if (isSponsorshipOverdue(row, today)) return "overdue";
  return sponsorshipStatusOf(row);
}

export type SponsorshipTotals = {
  cashReceived: number;
  promisedCash: number;
  inKindReceived: number;
  promisedInKind: number;
  cancelledValue: number;
  sponsorCount: number;
  prospectiveCount: number;
  promisedCount: number;
  confirmedCount: number;
  overdueCount: number;
  pendingCount: number;
};

export function summarizeSponsorships(
  rows: Array<
    Pick<
      GaneshSponsorship,
      "sponsorId" | "sponsoringType" | "amount" | "estimatedValue" | "status" | "expectedDate"
    >
  >,
  today = todayDateInput()
): SponsorshipTotals {
  const totals: SponsorshipTotals = {
    cashReceived: 0,
    promisedCash: 0,
    inKindReceived: 0,
    promisedInKind: 0,
    cancelledValue: 0,
    sponsorCount: 0,
    prospectiveCount: 0,
    promisedCount: 0,
    confirmedCount: 0,
    overdueCount: 0,
    pendingCount: 0,
  };
  const sponsors = new Set<string>();

  for (const row of rows ?? []) {
    if (!row) continue;
    const value = sponsorshipValue(row);
    const status = sponsorshipStatusOf(row);
    if (row.sponsorId) sponsors.add(row.sponsorId);
    if (status === "prospective") {
      totals.prospectiveCount += 1;
      totals.pendingCount += 1;
    } else if (status === "promised") {
      totals.promisedCount += 1;
      totals.pendingCount += 1;
      if (row.sponsoringType === "cash") totals.promisedCash += value;
      else if (isInKindSponsoring(row.sponsoringType)) totals.promisedInKind += value;
      if (isSponsorshipOverdue(row, today)) totals.overdueCount += 1;
    } else if (status === "confirmed") {
      totals.confirmedCount += 1;
      totals.pendingCount += 1;
      if (row.sponsoringType === "cash") totals.promisedCash += value;
      else if (isInKindSponsoring(row.sponsoringType)) totals.promisedInKind += value;
    } else if (status === "received") {
      if (row.sponsoringType === "cash") totals.cashReceived += value;
      else if (isInKindSponsoring(row.sponsoringType)) totals.inKindReceived += value;
    } else if (status === "cancelled") {
      totals.cancelledValue += value;
    }
  }

  return {
    cashReceived: money(totals.cashReceived),
    promisedCash: money(totals.promisedCash),
    inKindReceived: money(totals.inKindReceived),
    promisedInKind: money(totals.promisedInKind),
    cancelledValue: money(totals.cancelledValue),
    sponsorCount: sponsors.size,
    prospectiveCount: totals.prospectiveCount,
    promisedCount: totals.promisedCount,
    confirmedCount: totals.confirmedCount,
    overdueCount: totals.overdueCount,
    pendingCount: totals.pendingCount,
  };
}

export type SponsorBreakdownRow = {
  sponsorId: string;
  name: string;
  received: number;
  promised: number;
  inKind: number;
};

export function breakdownSponsors(
  rows: Array<
    Pick<
      GaneshSponsorship,
      "sponsorId" | "sponsoringType" | "amount" | "estimatedValue" | "status"
    >
  >,
  sponsors: Array<Pick<PandalSponsor, "id" | "name">>
): SponsorBreakdownRow[] {
  const names = new Map(sponsors.map((item) => [item.id, item.name]));
  const byId = new Map<string, SponsorBreakdownRow>();
  for (const row of rows) {
    const current = byId.get(row.sponsorId) ?? {
      sponsorId: row.sponsorId,
      name: names.get(row.sponsorId) || "Sponsor",
      received: 0,
      promised: 0,
      inKind: 0,
    };
    const value = sponsorshipValue(row);
    const status = sponsorshipStatusOf(row);
    if (status === "received") {
      if (isInKindSponsoring(row.sponsoringType)) current.inKind += value;
      else current.received += value;
    } else if (status === "promised" || status === "confirmed") {
      current.promised += value;
    }
    byId.set(row.sponsorId, current);
  }
  return [...byId.values()]
    .map((row) => ({
      ...row,
      received: money(row.received),
      promised: money(row.promised),
      inKind: money(row.inKind),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function assertCanConfirmSponsorship(prev: {
  status?: SponsorshipStatus | string;
}): void {
  if (prev.status !== "promised") {
    throw new Error("Only a promised sponsorship can be confirmed.");
  }
}

export function assertCanReceiveSponsorship(prev: {
  status?: SponsorshipStatus | string;
  contributionId?: string;
}): void {
  if (prev.contributionId) throw new Error("This sponsorship is already received.");
  if (prev.status === "received") throw new Error("This sponsorship is already received.");
  if (prev.status === "cancelled") throw new Error("A cancelled sponsorship cannot be marked received.");
  if (prev.status !== "promised" && prev.status !== "confirmed") {
    throw new Error("Only a promised or confirmed sponsorship can be marked received.");
  }
}

export function assertCanCancelSponsorship(prev: {
  status?: SponsorshipStatus | string;
}): void {
  if (prev.status === "cancelled") throw new Error("This sponsorship is already cancelled.");
  if (prev.status === "received") {
    throw new Error("A received sponsorship cannot be cancelled. Void the linked record if cash was recorded in error.");
  }
  if (prev.status !== "prospective" && prev.status !== "promised" && prev.status !== "confirmed") {
    throw new Error("Only an open sponsorship can be cancelled.");
  }
}

export function assertCanPromiseSponsorship(prev: {
  status?: SponsorshipStatus | string;
}): void {
  if (prev.status !== "prospective") {
    throw new Error("Only a prospective sponsorship can be marked promised.");
  }
}

export function canLinkSponsoredExpense(row: {
  sponsoringType?: SponsoringType | string;
  status?: SponsorshipStatus | string;
}): boolean {
  if (row.sponsoringType === "cash" && row.status === "received") return false;
  return true;
}
