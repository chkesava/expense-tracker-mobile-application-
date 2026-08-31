import type {
  Festival,
  FestivalMember,
  GaneshActivity,
  GaneshContribution,
  GaneshSponsorship,
  GaneshSummary,
  Household,
  PermanentFundSummary,
} from "@/shared/types/ganesh";
import { EMPTY_GANESH_SUMMARY, EMPTY_PERMANENT_FUND } from "@/shared/types/ganesh";
import {
  summarizeContributions,
  type ContributionTotals,
} from "@/shared/utils/ganeshContributions";
import {
  availableGodFund,
  effectiveCommitteeTarget,
  festivalCashSpent,
  festivalLocationTotal,
  festivalLocationsOf,
  locationInvariantHolds,
  money,
  parseGaneshSummary,
  parsePermanentFund,
  repairFestivalLocations,
  totalCashIn,
  type FestivalLocations,
} from "@/shared/utils/ganeshMath";
import {
  summarizeSponsorships,
  type SponsorshipTotals,
} from "@/shared/utils/ganeshSponsors";

export type MoneyLine = {
  id: string;
  label: string;
  amount: number;
};

export type PendingReimbursementMember = {
  memberId: string;
  displayName: string;
  amount: number;
};

export type FinancialOverview = {
  summary: GaneshSummary;
  availableGodFund: number;
  moneyIn: number;
  moneyOut: number;
  locations: FestivalLocations;
  locationInvariantHolds: boolean;
  permanentFund: PermanentFundSummary;
  moneyInLines: MoneyLine[];
  moneyOutLines: MoneyLine[];
  pendingReimbursements: number;
  pendingReimbursementMembers: PendingReimbursementMember[];
  committee: { target: number; received: number; pending: number };
  collections: { collected: number; donors: number; pendingHouses: number };
  sponsors: { received: number; promised: number };
  inKindEstimated: number;
  contributionTotals: ContributionTotals;
  sponsorTotals: SponsorshipTotals;
  health: {
    spentPct: number | null;
    committeePct: number | null;
    collectedPct: number | null;
  };
  hasFinancialActivity: boolean;
  recentActivity: GaneshActivity[];
};

export type FinancialOverviewInput = {
  summary?: GaneshSummary | null;
  permanentFund?: PermanentFundSummary | null;
  contributions?: GaneshContribution[];
  sponsorships?: GaneshSponsorship[];
  members?: FestivalMember[];
  households?: Household[];
  activity?: GaneshActivity[];
  festival?: Pick<Festival, "contributionTargetAmount"> | null;
  today?: string;
};

function pct(part: number, whole: number): number | null {
  if (!(whole > 0)) return null;
  return Math.max(0, money((part / whole) * 100));
}

export function buildFinancialOverview(input: FinancialOverviewInput): FinancialOverview {
  const summary = parseGaneshSummary(input.summary ?? EMPTY_GANESH_SUMMARY);
  const permanentFund = parsePermanentFund(input.permanentFund ?? EMPTY_PERMANENT_FUND);
  const contributionTotals = summarizeContributions(input.contributions ?? [], input.today);
  const sponsorTotals = summarizeSponsorships(input.sponsorships ?? [], input.today);

  const available = availableGodFund(summary);
  const moneyIn = totalCashIn(summary);
  const godAndReimburseOut = festivalCashSpent(summary);
  const transfersOut = money(summary.transferredToPermanentFund ?? 0);
  const moneyOut = money(godAndReimburseOut + transfersOut);

  const pfIn = money(summary.receivedFromPermanentFund ?? 0);
  const openingExclusive = money(Math.max(0, summary.openingFunds - pfIn));
  const sponsorCash = money(Math.min(sponsorTotals.cashReceived, summary.otherCashContributions));
  const otherCash = money(Math.max(0, summary.otherCashContributions - sponsorCash));

  const moneyInLines: MoneyLine[] = [
    { id: "opening", label: "Opening Fund", amount: openingExclusive },
    { id: "chanda", label: "Chanda", amount: summary.chanda },
    { id: "committee", label: "Committee Contributions", amount: summary.committeeContributions },
    { id: "sponsors", label: "Sponsors", amount: sponsorCash },
    { id: "other", label: "Other", amount: otherCash },
    { id: "permanentIn", label: "Permanent Fund Transfer In", amount: pfIn },
  ];

  const moneyOutLines: MoneyLine[] = [
    { id: "godExpenses", label: "God Fund Expenses", amount: summary.godFundExpenses },
    { id: "reimbursements", label: "Reimbursements", amount: summary.reimbursements },
    { id: "permanentOut", label: "Permanent Fund Transfer Out", amount: transfersOut },
  ];

  const members = input.members ?? [];
  const defaultTarget = Number(input.festival?.contributionTargetAmount ?? 0);
  let committeeTarget = 0;
  let committeeReceived = 0;
  const pendingReimbursementMembers: PendingReimbursementMember[] = [];
  for (const member of members) {
    const target = effectiveCommitteeTarget(member, defaultTarget);
    committeeTarget = money(committeeTarget + target);
    committeeReceived = money(committeeReceived + Number(member.contributionPaid ?? 0));
    const pending = money(Number(member.pendingReimbursement ?? 0));
    if (pending > 0) {
      pendingReimbursementMembers.push({
        memberId: member.userId || member.id,
        displayName: member.displayName || "Member",
        amount: pending,
      });
    }
  }
  pendingReimbursementMembers.sort((a, b) => b.amount - a.amount);
  const committeePending = money(Math.max(0, committeeTarget - committeeReceived));

  const households = input.households ?? [];
  const pendingHouses = households.filter(
    (house) => house.status === "pending" || house.status === "partial"
  ).length;
  const paidHouses = households.filter((house) => house.status === "paid").length;
  const countableHouses = households.filter(
    (house) => house.status !== "not_interested" && house.status !== "not_available"
  ).length;

  const memberPendingTotal = pendingReimbursementMembers.reduce(
    (sum, row) => money(sum + row.amount),
    0
  );
  const pendingReimbursements =
    members.length > 0 ? memberPendingTotal : money(summary.pendingReimbursements ?? 0);

  const locations = repairFestivalLocations(summary);
  const diskLocations = festivalLocationsOf(summary);

  return {
    summary,
    availableGodFund: available,
    moneyIn,
    moneyOut,
    locations,
    locationInvariantHolds:
      locationInvariantHolds(summary) || festivalLocationTotal(diskLocations) === 0,
    permanentFund,
    moneyInLines,
    moneyOutLines,
    pendingReimbursements,
    pendingReimbursementMembers,
    committee: {
      target: committeeTarget,
      received: committeeReceived,
      pending: committeePending,
    },
    collections: {
      collected: summary.chanda,
      donors: summary.collectionCount,
      pendingHouses,
    },
    sponsors: {
      received: sponsorCash,
      promised: sponsorTotals.promisedCash,
    },
    inKindEstimated: money(contributionTotals.inKindReceived + sponsorTotals.inKindReceived),
    contributionTotals,
    sponsorTotals,
    health: {
      spentPct: pct(godAndReimburseOut, moneyIn),
      committeePct: pct(committeeReceived, committeeTarget),
      collectedPct: pct(paidHouses, countableHouses),
    },
    hasFinancialActivity: moneyIn > 0 || moneyOut > 0 || pendingReimbursements > 0,
    recentActivity: (input.activity ?? []).slice(0, 8),
  };
}
