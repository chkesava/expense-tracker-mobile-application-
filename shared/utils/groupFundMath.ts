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
import { emptyGroupFundTotals, fundStartPeriod, memberOwesIn } from "./groupFundModel";
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

export type GroupFundsHeldSummary = {
  /** Money held for others across every fund (stored totals, never re-added from events). */
  held: number;
  /** The same money by the real account it sits in. Opening money with no account is not here. */
  heldByAccount: Record<string, number>;
};

/** SPENDLY-686: the net worth and runway input, from the funds' stored totals. */
export function summarizeGroupFundsHeld(
  funds: readonly Pick<GroupFund, "totals" | "heldByAccount">[]
): GroupFundsHeldSummary {
  const heldByAccount: Record<string, number> = {};
  for (const fund of funds) {
    for (const [accountId, amount] of Object.entries(fund.heldByAccount ?? {})) {
      heldByAccount[accountId] = roundMoney((heldByAccount[accountId] ?? 0) + amount);
    }
  }
  return { held: totalGroupFundsHeld(funds), heldByAccount };
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
 * Expected / received / pending for each member who owes in `period` and each
 * purpose that has `expectedPerMember` set. Purposes without an expected
 * amount are left out entirely — there is nothing to be pending against.
 *
 * Monthly purposes compare against contributions for `period` (YYYY-MM).
 * Ad-hoc purposes compare against every contribution ever made.
 * Reversed contributions do not count as received.
 *
 * SPENDLY-688: nothing is owed before the fund's start month, by a member
 * before their join month, or from their leave month on.
 */
export function memberContributionStatus(
  fund: Pick<GroupFund, "purposes" | "members"> & Partial<Pick<GroupFund, "startPeriod" | "createdAtMs">>,
  events: readonly GroupFundEvent[],
  period: string
): MemberContributionStatus[] {
  const start = fundStartPeriod(fund);
  if (start && period < start) return [];
  const purposes = fund.purposes.filter(
    (p): p is GroupFundPurpose & { expectedPerMember: number } =>
      !p.archived && typeof p.expectedPerMember === "number" && p.expectedPerMember > 0
  );
  const members = fund.members.filter((m) => memberOwesIn(m, period));
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

export type MemberMonthStatus = {
  /** The purpose's expected amount per member, or null when none is set. */
  expected: number | null;
  /** Received for this member, purpose and month, net of reversed contributions. */
  received: number;
};

/**
 * SPENDLY-687: what one member has paid toward one purpose for one month
 * (`period`), from that month's events. Used to stop the same payment being
 * recorded twice; works whether or not an expected amount is set.
 */
export function memberMonthStatus(
  fund: Pick<GroupFund, "purposes">,
  events: readonly GroupFundEvent[],
  memberId: string,
  purposeId: string,
  period: string
): MemberMonthStatus {
  const purpose = fund.purposes.find((p) => p.id === purposeId);
  let received = 0;
  for (const e of events) {
    if (e.memberId !== memberId || e.purposeId !== purposeId || periodOf(e) !== period) continue;
    if (e.kind === "contribution") received += e.amount;
    else if (e.kind === "reversal" && e.reversedKind === "contribution") received -= e.amount;
  }
  return { expected: purpose?.expectedPerMember ?? null, received: roundMoney(received) };
}

/**
 * SPENDLY-687: an account's balance split into money held for others and the
 * user's own. Display only; both inputs are stored figures.
 */
export function splitAccountBalance(balance: number, heldForOthers: number): { held: number; yours: number } {
  const held = roundMoney(Math.max(0, heldForOthers));
  return { held, yours: roundMoney(balance - held) };
}

// ---------------------------------------------------------------------------
// SPENDLY-688: the month view and account reconciliation
// ---------------------------------------------------------------------------

export type MemberMonthState = "paid" | "partial" | "unpaid";

export type GroupFundMonthRow = MemberContributionStatus & { state: MemberMonthState };

export type GroupFundMonthPurpose = {
  purposeId: string;
  rows: GroupFundMonthRow[];
  expected: number;
  collected: number;
  pending: number;
  paidCount: number;
};

/**
 * Who paid, who partly paid and who didn't, for each **monthly** purpose with
 * an expected amount, in `period`. Built from that month's events only (one
 * bounded read); nothing is created per month, so no month can be missed.
 */
export function groupFundMonthSummary(
  fund: Pick<GroupFund, "purposes" | "members"> & Partial<Pick<GroupFund, "startPeriod" | "createdAtMs">>,
  monthEvents: readonly GroupFundEvent[],
  period: string
): GroupFundMonthPurpose[] {
  const monthly = { ...fund, purposes: fund.purposes.filter((p) => p.cadence === "monthly") };
  const statuses = memberContributionStatus(monthly, monthEvents, period);
  const out: GroupFundMonthPurpose[] = [];
  for (const purpose of monthly.purposes) {
    const rows: GroupFundMonthRow[] = statuses
      .filter((s) => s.purposeId === purpose.id)
      .map((s) => ({
        ...s,
        state: s.pending <= 0.005 ? "paid" : s.received > 0.005 ? "partial" : "unpaid",
      }));
    if (rows.length === 0) continue;
    out.push({
      purposeId: purpose.id,
      rows,
      expected: roundMoney(rows.reduce((sum, r) => sum + r.expected, 0)),
      // Collected toward what was expected: an overpayment doesn't hide someone else's due.
      collected: roundMoney(rows.reduce((sum, r) => sum + Math.min(r.received, r.expected), 0)),
      pending: roundMoney(rows.reduce((sum, r) => sum + r.pending, 0)),
      paidCount: rows.filter((r) => r.state === "paid").length,
    });
  }
  return out;
}

export type HeldByAccountRow = {
  accountId: string;
  /** Held for others in this account, across every fund (stored totals). */
  held: number;
  /** The account's stored balance, or null if the account is gone. */
  balance: number | null;
  /** How much more is recorded as held than the account has (0 when fine). */
  shortfall: number;
};

/**
 * SPENDLY-688 (feature 7): where held money sits, against each account's real
 * balance. A shortfall means the group money recorded in an account is more
 * than the account holds — usually a payout recorded from the wrong account
 * or a contribution that never arrived. Stored figures only.
 */
export function reconcileHeldByAccount(
  funds: readonly Pick<GroupFund, "heldByAccount">[],
  balances: ReadonlyMap<string, number>
): HeldByAccountRow[] {
  const held = new Map<string, number>();
  for (const fund of funds) {
    for (const [accountId, amount] of Object.entries(fund.heldByAccount ?? {})) {
      held.set(accountId, roundMoney((held.get(accountId) ?? 0) + amount));
    }
  }
  return [...held.entries()]
    .filter(([, amount]) => Math.abs(amount) > 0.005)
    .map(([accountId, amount]) => {
      const balance = balances.has(accountId) ? balances.get(accountId)! : null;
      const shortfall = balance === null ? amount : roundMoney(Math.max(0, amount - balance));
      return { accountId, held: amount, balance, shortfall };
    })
    .sort((a, b) => b.held - a.held);
}
