import type {
  Festival,
  FestivalMember,
  GaneshActivity,
  GaneshCollection,
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
  locationInvariantHolds,
  money,
  parseGaneshSummary,
  parsePermanentFund,
  repairFestivalLocations,
  totalCashIn,
  unclassifiedGodFund,
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

export type AreaCoverage = {
  area: string;
  paid: number;
  total: number;
};

export type CollectionTodayTotals = {
  count: number;
  amount: number;
  cash: number;
  upi: number;
  bank: number;
  other: number;
};

export type CollectionCoverage = {
  collected: number;
  donors: number;
  paidHouses: number;
  pendingHouses: number;
  notAvailable: number;
  notInterested: number;
  countableHouses: number;
  coveragePct: number | null;
  byArea: AreaCoverage[];
  today: CollectionTodayTotals;
};

export type FinancialOverview = {
  summary: GaneshSummary;
  availableGodFund: number;
  moneyIn: number;
  moneyOut: number;
  locations: FestivalLocations;
  locationInvariantHolds: boolean;
  /**
   * God Fund whose Cash/UPI/Bank location was never recorded. Spendable from
   * any location; shown under "Other" until a recalculate classifies it.
   */
  unclassifiedGodFund: number;
  permanentFund: PermanentFundSummary;
  moneyInLines: MoneyLine[];
  moneyOutLines: MoneyLine[];
  pendingReimbursements: number;
  pendingReimbursementMembers: PendingReimbursementMember[];
  committee: { target: number; received: number; pending: number };
  collections: CollectionCoverage;
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
  collections?: GaneshCollection[];
  activity?: GaneshActivity[];
  festival?: Pick<Festival, "contributionTargetAmount"> | null;
  today?: string;
};

function pct(part: number, whole: number): number | null {
  if (!(whole > 0)) return null;
  return Math.max(0, money((part / whole) * 100));
}

function summarizeCollectionToday(
  collections: GaneshCollection[],
  today: string
): CollectionTodayTotals {
  const todayRows = collections.filter(
    (row) => !row.voided && row.date === today
  );
  const byMethod = { cash: 0, upi: 0, bank: 0, other: 0 };
  let amount = 0;
  for (const row of todayRows) {
    const value = money(Number(row.amount ?? 0));
    amount = money(amount + value);
    const method = row.paymentMethod;
    if (method === "cash" || method === "upi" || method === "bank" || method === "other") {
      byMethod[method] = money(byMethod[method] + value);
    } else {
      byMethod.other = money(byMethod.other + value);
    }
  }
  return { count: todayRows.length, amount, ...byMethod };
}

function summarizeCoverageByArea(households: Household[]): AreaCoverage[] {
  const map = new Map<string, { paid: number; total: number }>();
  for (const house of households) {
    const area = (house.area ?? "").trim();
    if (!area) continue;
    if (house.status === "not_interested" || house.status === "not_available") continue;
    const row = map.get(area) ?? { paid: 0, total: 0 };
    row.total += 1;
    if (house.status === "paid") row.paid += 1;
    map.set(area, row);
  }
  return [...map.entries()]
    .map(([area, row]) => ({ area, paid: row.paid, total: row.total }))
    .sort((a, b) => a.area.localeCompare(b.area));
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
  const notAvailable = households.filter((house) => house.status === "not_available").length;
  const notInterested = households.filter((house) => house.status === "not_interested").length;
  const countableHouses = households.filter(
    (house) => house.status !== "not_interested" && house.status !== "not_available"
  ).length;
  const coveragePct = pct(paidHouses, countableHouses);
  const todayKey = input.today ?? "";
  const today = todayKey
    ? summarizeCollectionToday(input.collections ?? [], todayKey)
    : { count: 0, amount: 0, cash: 0, upi: 0, bank: 0, other: 0 };

  const memberPendingTotal = pendingReimbursementMembers.reduce(
    (sum, row) => money(sum + row.amount),
    0
  );
  const pendingReimbursements =
    members.length > 0 ? memberPendingTotal : money(summary.pendingReimbursements ?? 0);

  const locations = repairFestivalLocations(summary);
  const unclassified = unclassifiedGodFund(summary);

  return {
    summary,
    availableGodFund: available,
    moneyIn,
    moneyOut,
    locations,
    // Every bucket sitting at zero on a festival holding money used to count as
    // healthy here, which is exactly the unbackfilled state that blocked spends
    // while claiming nothing was wrong. Unclassified money is now reported, not
    // excused.
    locationInvariantHolds: locationInvariantHolds(summary),
    unclassifiedGodFund: unclassified,
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
      paidHouses,
      pendingHouses,
      notAvailable,
      notInterested,
      countableHouses,
      coveragePct,
      byArea: summarizeCoverageByArea(households),
      today,
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
      collectedPct: coveragePct,
    },
    hasFinancialActivity: moneyIn > 0 || moneyOut > 0 || pendingReimbursements > 0,
    recentActivity: (input.activity ?? []).slice(0, 8),
  };
}
