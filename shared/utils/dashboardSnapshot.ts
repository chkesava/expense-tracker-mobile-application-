/**
 * SPENDLY-632 — the "last seen dashboard": a display-only copy of the
 * figures the dashboard showed last time, so a cold start can draw them at
 * once instead of a blank screen or skeletons while the listeners reconnect.
 *
 * Native builds have no durable Firestore cache (`lib/firebase.ts`; the real
 * fix is SPENDLY-633), so every cold start waits on the server. This is the
 * interim answer, and it is deliberately narrow:
 * - it holds only the six dashboard period summaries and the net-worth totals
 *   the dashboard already computed — no transactions, no ledger;
 * - nothing reads money from it: each section shows it only until its own
 *   live data arrives, and it is always labelled as saved figures;
 * - it is keyed to one user and one month, and never used in duress.
 */

import type { DashboardPeriodSummary } from "@/shared/types/financialSummary";
import type { NetWorthTotals } from "@/shared/utils/netWorth";

export const DASHBOARD_SNAPSHOT_VERSION = 1;
/** Older than this and the snapshot is ignored rather than shown. */
export const DASHBOARD_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type SnapshotPeriodSummary = Pick<
  DashboardPeriodSummary,
  "period" | "totalExpenses" | "totalIncome" | "categoryTotals" | "transactionCount" | "summaryVersion"
>;

export type SnapshotNetWorth = NetWorthTotals & { holdingsMissingQuote: number };

export interface DashboardSnapshot {
  v: typeof DASHBOARD_SNAPSHOT_VERSION;
  uid: string;
  /** The `YYYY-MM` month the summaries were shown for. */
  month: string;
  savedAtMs: number;
  summaries: SnapshotPeriodSummary[];
  netWorth: SnapshotNetWorth;
}

const NET_WORTH_NUMBER_KEYS = [
  "liquidBankAssets",
  "investmentsValue",
  "epfValue",
  "epfUnreconciledCount",
  "stocksHoldingsValue",
  "stocksCashBalance",
  "totalStocksValue",
  "totalAssets",
  "creditCardLiabilities",
  "bankOverdraftLiabilities",
  "borrowingLiabilities",
  "receivableAssets",
  "totalLiabilities",
  "totalNetWorth",
  "untrustedBalanceAccounts",
  "holdingsMissingQuote",
] as const satisfies readonly (keyof SnapshotNetWorth)[];

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function toSnapshotSummary(s: DashboardPeriodSummary): SnapshotPeriodSummary {
  return {
    period: s.period,
    totalExpenses: s.totalExpenses,
    totalIncome: s.totalIncome,
    categoryTotals: { ...(s.categoryTotals ?? {}) },
    transactionCount: s.transactionCount,
    summaryVersion: s.summaryVersion,
  };
}

function pickNetWorth(totals: SnapshotNetWorth): SnapshotNetWorth {
  const picked = {
    liquidBalanceMayBePartial: totals.liquidBalanceMayBePartial,
    untrustedBalanceAccountNames: [...totals.untrustedBalanceAccountNames],
  } as SnapshotNetWorth;
  for (const key of NET_WORTH_NUMBER_KEYS) picked[key] = totals[key];
  return picked;
}

/**
 * Builds the snapshot to save, or null when what is on screen is not a
 * settled, complete picture worth showing again: both the summaries and the
 * net worth (valuations included) must have finished loading without error.
 */
export function buildDashboardSnapshot(input: {
  uid: string | null | undefined;
  isDuress: boolean;
  month: string;
  nowMs: number;
  summaries: readonly DashboardPeriodSummary[];
  summariesSettled: boolean;
  netWorth: SnapshotNetWorth | null;
  netWorthSettled: boolean;
}): DashboardSnapshot | null {
  if (!input.uid || input.isDuress || !input.month) return null;
  if (!input.summariesSettled || !input.netWorthSettled || !input.netWorth) return null;
  const summaries = input.summaries
    .filter((s) => typeof s?.period === "string")
    .map(toSnapshotSummary);
  const netWorth = pickNetWorth(input.netWorth);
  return {
    v: DASHBOARD_SNAPSHOT_VERSION,
    uid: input.uid,
    month: input.month,
    savedAtMs: input.nowMs,
    summaries,
    netWorth,
  };
}

function validSummary(value: unknown): value is SnapshotPeriodSummary {
  const s = value as Partial<SnapshotPeriodSummary> | null;
  if (!s || typeof s.period !== "string") return false;
  if (!isFiniteNumber(s.totalExpenses) || !isFiniteNumber(s.totalIncome)) return false;
  if (!s.categoryTotals || typeof s.categoryTotals !== "object") return false;
  return Object.values(s.categoryTotals).every(isFiniteNumber);
}

function validNetWorth(value: unknown): value is SnapshotNetWorth {
  const n = value as Partial<SnapshotNetWorth> | null;
  if (!n || typeof n !== "object") return false;
  if (typeof n.liquidBalanceMayBePartial !== "boolean") return false;
  if (!Array.isArray(n.untrustedBalanceAccountNames)) return false;
  return NET_WORTH_NUMBER_KEYS.every((key) => isFiniteNumber(n[key]));
}

/**
 * The saved snapshot, if it is safe to show for this user and month right
 * now. Anything malformed, foreign, stale or from another month is a miss.
 */
export function readDashboardSnapshot(
  raw: string | null | undefined,
  expected: { uid: string | null | undefined; isDuress: boolean; month: string; nowMs: number }
): DashboardSnapshot | null {
  if (!raw || !expected.uid || expected.isDuress) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const s = parsed as Partial<DashboardSnapshot> | null;
  if (!s || s.v !== DASHBOARD_SNAPSHOT_VERSION) return null;
  if (s.uid !== expected.uid || s.month !== expected.month) return null;
  if (!isFiniteNumber(s.savedAtMs)) return null;
  const age = expected.nowMs - s.savedAtMs;
  if (age < 0 || age > DASHBOARD_SNAPSHOT_MAX_AGE_MS) return null;
  if (!Array.isArray(s.summaries) || !s.summaries.every(validSummary)) return null;
  if (!validNetWorth(s.netWorth)) return null;
  return s as DashboardSnapshot;
}

/** Restores summaries in the live shape (newest first, like the listener). */
export function snapshotPeriodSummaries(snapshot: DashboardSnapshot): DashboardPeriodSummary[] {
  return snapshot.summaries
    .map((s) => ({ ...s, calculatedAt: "" }))
    .sort((a, b) => b.period.localeCompare(a.period));
}

/**
 * The net-worth summary to draw from a snapshot. `secondaryLoading` stays
 * true: the card then reads "Updating valuations…", and the daily history
 * recorder is blocked (`valuationsLoading`), so saved figures are never
 * recorded as today's point.
 */
export function snapshotNetWorthSummary(
  netWorth: SnapshotNetWorth
): SnapshotNetWorth & { loading: false; secondaryLoading: true } {
  return { ...netWorth, loading: false, secondaryLoading: true };
}

/** "just now", "12 min ago", "3 h ago", "2 days ago" — for the saved-figures label. */
export function snapshotAgeLabel(savedAtMs: number, nowMs: number): string {
  const minutes = Math.max(0, Math.floor((nowMs - savedAtMs) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
