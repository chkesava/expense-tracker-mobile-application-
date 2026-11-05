/**
 * SPENDLY-683 — Group Funds arithmetic (epic SPENDLY-678).
 *
 * One definition of what each event does to a fund's totals, used both by the
 * write builders (to produce the stored increments) and by the rebuild/
 * reconcile check (to prove the stored totals match the history). Screens show
 * the stored totals; they do not call the rebuild.
 */

import type {
  GroupFund,
  GroupFundEvent,
  GroupFundEventKind,
  GroupFundPurpose,
  GroupFundTotals,
} from "../types/groupFund";
import { emptyGroupFundTotals } from "./groupFundModel";
import { roundMoney } from "./money";

type Bucket = Exclude<keyof GroupFundTotals, "held">;

export type GroupFundEffect = {
  /** Signed change per total bucket (never `held`; see `heldDelta`). */
  buckets: Partial<Record<Bucket, number>>;
  /** Signed change to the held amount. */
  heldDelta: number;
  /** Signed change to held money per real account. */
  accountDeltas: Record<string, number>;
};

type EffectInput = Pick<GroupFundEvent, "kind" | "amount" | "accountId" | "toAccountId" | "reversedKind">;

function baseEffect(
  kind: Exclude<GroupFundEventKind, "reversal">,
  amount: number,
  accountId: string | undefined,
  toAccountId: string | undefined
): GroupFundEffect {
  const accountDeltas: Record<string, number> = {};
  switch (kind) {
    case "opening":
      if (accountId) accountDeltas[accountId] = amount;
      return { buckets: { opening: amount }, heldDelta: amount, accountDeltas };
    case "contribution":
      if (accountId) accountDeltas[accountId] = amount;
      return { buckets: { contributions: amount }, heldDelta: amount, accountDeltas };
    case "payout":
      if (accountId) accountDeltas[accountId] = -amount;
      return { buckets: { payouts: amount }, heldDelta: -amount, accountDeltas };
    case "transfer_out":
      return { buckets: { transfersOut: amount }, heldDelta: -amount, accountDeltas };
    case "transfer_in":
      return { buckets: { transfersIn: amount }, heldDelta: amount, accountDeltas };
    case "account_move":
      if (accountId) accountDeltas[accountId] = -amount;
      if (toAccountId) accountDeltas[toAccountId] = (accountDeltas[toAccountId] ?? 0) + amount;
      return { buckets: {}, heldDelta: 0, accountDeltas };
  }
}

function negate(effect: GroupFundEffect): GroupFundEffect {
  const buckets: Partial<Record<Bucket, number>> = {};
  for (const [k, v] of Object.entries(effect.buckets)) buckets[k as Bucket] = -(v as number);
  const accountDeltas: Record<string, number> = {};
  for (const [k, v] of Object.entries(effect.accountDeltas)) accountDeltas[k] = -v;
  return { buckets, heldDelta: -effect.heldDelta, accountDeltas };
}

/** What one event does to its fund. A reversal is the exact negation of what it undoes. */
export function groupFundEventEffect(event: EffectInput): GroupFundEffect {
  if (event.kind === "reversal") {
    if (!event.reversedKind) return { buckets: {}, heldDelta: 0, accountDeltas: {} };
    return negate(baseEffect(event.reversedKind, event.amount, event.accountId, event.toAccountId));
  }
  return baseEffect(event.kind, event.amount, event.accountId, event.toAccountId);
}

function applyToTotals(totals: GroupFundTotals, effect: GroupFundEffect): GroupFundTotals {
  const next = { ...totals };
  for (const [k, v] of Object.entries(effect.buckets)) {
    next[k as Bucket] = roundMoney(next[k as Bucket] + (v as number));
  }
  next.held = roundMoney(next.held + effect.heldDelta);
  return next;
}

export type GroupFundRebuild = {
  totals: GroupFundTotals;
  byPurpose: Record<string, GroupFundTotals>;
  heldByAccount: Record<string, number>;
};

/** The totals a fund should store, from its full event history. */
export function rebuildGroupFundTotals(events: readonly GroupFundEvent[]): GroupFundRebuild {
  let totals = emptyGroupFundTotals();
  const byPurpose: Record<string, GroupFundTotals> = {};
  const heldByAccount: Record<string, number> = {};
  for (const event of events) {
    const effect = groupFundEventEffect(event);
    totals = applyToTotals(totals, effect);
    byPurpose[event.purposeId] = applyToTotals(byPurpose[event.purposeId] ?? emptyGroupFundTotals(), effect);
    for (const [accountId, delta] of Object.entries(effect.accountDeltas)) {
      heldByAccount[accountId] = roundMoney((heldByAccount[accountId] ?? 0) + delta);
    }
  }
  return { totals, byPurpose, heldByAccount };
}

export type GroupFundDifference = { field: string; stored: number; expected: number };

/**
 * Compares a fund's stored totals with its history. An empty result means the
 * stored numbers are exactly what the events add up to.
 */
export function reconcileGroupFund(
  fund: Pick<GroupFund, "totals" | "byPurpose" | "heldByAccount">,
  events: readonly GroupFundEvent[]
): GroupFundDifference[] {
  const expected = rebuildGroupFundTotals(events);
  const diffs: GroupFundDifference[] = [];
  const compare = (field: string, stored: number | undefined, want: number | undefined) => {
    const s = roundMoney(stored ?? 0);
    const e = roundMoney(want ?? 0);
    if (Math.abs(s - e) > 0.005) diffs.push({ field, stored: s, expected: e });
  };
  const keys = Object.keys(emptyGroupFundTotals()) as (keyof GroupFundTotals)[];
  for (const k of keys) compare(`totals.${k}`, fund.totals?.[k], expected.totals[k]);
  const purposeIds = new Set([...Object.keys(fund.byPurpose ?? {}), ...Object.keys(expected.byPurpose)]);
  for (const id of purposeIds) {
    for (const k of keys) compare(`byPurpose.${id}.${k}`, fund.byPurpose?.[id]?.[k], expected.byPurpose[id]?.[k]);
  }
  const accountIds = new Set([...Object.keys(fund.heldByAccount ?? {}), ...Object.keys(expected.heldByAccount)]);
  for (const id of accountIds) compare(`heldByAccount.${id}`, fund.heldByAccount?.[id], expected.heldByAccount[id]);
  return diffs;
}

/** Ids of events that a reversal has already undone. */
export function reversedGroupFundEventIds(events: readonly Pick<GroupFundEvent, "kind" | "reversalOf">[]): Set<string> {
  const ids = new Set<string>();
  for (const e of events) if (e.kind === "reversal" && e.reversalOf) ids.add(e.reversalOf);
  return ids;
}

/** Sum of stored held amounts across funds — the "Group funds held" figure. */
export function totalGroupFundsHeld(funds: readonly Pick<GroupFund, "totals">[]): number {
  return roundMoney(funds.reduce((sum, f) => sum + (f.totals?.held ?? 0), 0));
}

// ---------------------------------------------------------------------------
// Member expected / received / pending (AC9)
// ---------------------------------------------------------------------------

export type MemberContributionStatus = {
  memberId: string;
  purposeId: string;
  expected: number;
  received: number;
  pending: number;
};

function periodOf(event: Pick<GroupFundEvent, "period" | "date">): string {
  return event.period ?? event.date.slice(0, 7);
}

/**
 * Expected / received / pending for each active member and each purpose that
 * has `expectedPerMember` set. Purposes without an expected amount are left
 * out entirely — there is nothing to be pending against.
 *
 * Monthly purposes compare against contributions for `period` (YYYY-MM).
 * Ad-hoc purposes compare against every contribution ever made.
 * Reversed contributions do not count as received.
 */
export function memberContributionStatus(
  fund: Pick<GroupFund, "purposes" | "members">,
  events: readonly GroupFundEvent[],
  period: string
): MemberContributionStatus[] {
  const purposes = fund.purposes.filter(
    (p): p is GroupFundPurpose & { expectedPerMember: number } =>
      !p.archived && typeof p.expectedPerMember === "number" && p.expectedPerMember > 0
  );
  const members = fund.members.filter((m) => !m.archived);
  const received = new Map<string, number>();
  const key = (memberId: string, purposeId: string) => `${memberId}|${purposeId}`;
  for (const e of events) {
    const isContribution = e.kind === "contribution";
    const isReversedContribution = e.kind === "reversal" && e.reversedKind === "contribution";
    if ((!isContribution && !isReversedContribution) || !e.memberId) continue;
    const purpose = purposes.find((p) => p.id === e.purposeId);
    if (!purpose) continue;
    if (purpose.cadence === "monthly" && periodOf(e) !== period) continue;
    const k = key(e.memberId, e.purposeId);
    received.set(k, roundMoney((received.get(k) ?? 0) + (isContribution ? e.amount : -e.amount)));
  }
  const out: MemberContributionStatus[] = [];
  for (const purpose of purposes) {
    for (const member of members) {
      const got = received.get(key(member.id, purpose.id)) ?? 0;
      out.push({
        memberId: member.id,
        purposeId: purpose.id,
        expected: purpose.expectedPerMember,
        received: got,
        pending: roundMoney(Math.max(0, purpose.expectedPerMember - got)),
      });
    }
  }
  return out;
}
