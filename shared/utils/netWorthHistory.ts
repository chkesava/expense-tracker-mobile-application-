/**
 * SPENDLY-568 — net-worth history.
 *
 * One document per month at `users/{uid}/netWorthHistory/{YYYY-MM}`, holding a
 * map of daily points keyed by day of month ("01".."31"). A month bucket keeps
 * a 12-month chart to at most 12 document reads instead of ~365.
 *
 * A point is a copy of the `useUnifiedNetWorth` totals on that day — never a
 * new calculation. Points are append-only (firestore.rules refuses to change
 * or remove a recorded day), so a day is recorded once and replays of the same
 * write are no-ops.
 *
 * Snapshot rule: a point is only written when the valuation is complete — see
 * `snapshotBlockers`. A day with no complete valuation simply has no point.
 */

import { parseLocalDate } from "./dates";

export const NET_WORTH_HISTORY_COLLECTION = "netWorthHistory";
export const NET_WORTH_HISTORY_SCHEMA_VERSION = 1;
/** How many months the dashboard reads (and the longest period it offers). */
export const NET_WORTH_HISTORY_MONTHS = 12;
/** Magnitude bound shared with firestore.rules. */
export const NET_WORTH_VALUE_LIMIT = 1_000_000_000_000;
/** Below this many recorded days the card shows the empty state instead of a line. */
export const MIN_POINTS_FOR_TREND = 3;
/** Most points the card draws; longer series are thinned evenly. */
export const MAX_CHART_POINTS = 60;

/** Fields of the month document, in rules order (contract-tested). */
export const NET_WORTH_HISTORY_DOC_FIELDS = [
  "month",
  "points",
  "schemaVersion",
  "createdAtMs",
  "updatedAtMs",
] as const;

/** Fields of one stored daily point. */
export const NET_WORTH_POINT_FIELDS = ["netWorth", "assets", "liabilities", "recordedAtMs"] as const;

export type StoredNetWorthPoint = {
  netWorth: number;
  assets: number;
  liabilities: number;
  recordedAtMs: number;
};

export type NetWorthHistoryDoc = {
  month: string;
  points: Record<string, StoredNetWorthPoint>;
  schemaVersion: number;
  createdAtMs: number;
  updatedAtMs: number;
};

/** A recorded day, flattened for charts. */
export type NetWorthPoint = {
  date: string;
  netWorth: number;
  assets: number;
  liabilities: number;
};

const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_RE = /^(0[1-9]|[12]\d|3[01])$/;

export function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

export function dayKeyOf(dateKey: string): string {
  return dateKey.slice(8, 10);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** `dateKey` moved back by whole months, clamped to the end of a shorter month. */
export function monthsBefore(dateKey: string, months: number): string {
  const d = parseLocalDate(dateKey);
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() - months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return toKey(target);
}

/** First month the dashboard reads: `months` calendar months ending with today's. */
export function historyStartMonth(todayKey: string, months = NET_WORTH_HISTORY_MONTHS): string {
  return monthKeyOf(monthsBefore(`${monthKeyOf(todayKey)}-01`, Math.max(0, months - 1)));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function boundedFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) < NET_WORTH_VALUE_LIMIT;
}

/* --------------------------------------------------------- snapshot rule */

export type NetWorthSnapshotBlocker =
  | "duress"
  | "offline"
  | "loading"
  | "valuationsLoading"
  | "untrustedBalances"
  | "invalidValues";

export type SnapshotReadiness = {
  isDuress: boolean;
  isOnline: boolean;
  loading: boolean;
  secondaryLoading?: boolean;
  /** SPENDLY-620: accounts whose stored balance is missing or awaiting reconciliation. */
  untrustedBalanceAccounts: number;
  totalNetWorth: number;
  totalAssets: number;
  totalLiabilities: number;
};

/**
 * Why a snapshot must not be recorded right now (empty = record it). A
 * snapshot is never taken while any source (quotes included) is still
 * loading, an account's stored balance is missing or awaiting reconciliation,
 * the device is offline (cached data may be stale), or the session is the
 * duress decoy.
 *
 * SPENDLY-620: every blocker here must be able to clear on its own or by a
 * user action. Two that could not were removed:
 * - the staged-ledger flag (SPENDLY-413) — the roll-up reads each account's
 *   stored balance, never the loaded ledger, so it never affected the value,
 *   yet it stayed set for anyone with 300+ transactions;
 * - missing quotes — once quotes have loaded, a holding with no quote is
 *   recorded at cost, exactly as the headline shows it, instead of blocking
 *   every day for as long as its quote is unavailable.
 */
export function snapshotBlockers(input: SnapshotReadiness): NetWorthSnapshotBlocker[] {
  const blockers: NetWorthSnapshotBlocker[] = [];
  if (input.isDuress) blockers.push("duress");
  if (!input.isOnline) blockers.push("offline");
  if (input.loading) blockers.push("loading");
  if (input.secondaryLoading) blockers.push("valuationsLoading");
  if (input.untrustedBalanceAccounts > 0) blockers.push("untrustedBalances");
  if (
    !boundedFinite(input.totalNetWorth) ||
    !boundedFinite(input.totalAssets) ||
    !boundedFinite(input.totalLiabilities)
  ) {
    blockers.push("invalidValues");
  }
  return blockers;
}

export type NetWorthRecorderState = "saved" | "waiting" | "blocked" | "failed";

export type NetWorthRecorderStatus = {
  state: NetWorthRecorderState;
  blockers: NetWorthSnapshotBlocker[];
  /** Accounts behind an `untrustedBalances` blocker, named in the message. */
  accountNames?: string[];
};

/**
 * SPENDLY-620: what the card says about today's point. "waiting" covers the
 * blockers that clear on their own (loading, settling); "blocked" is one the
 * user has to act on or wait out (offline, untrusted balance, bad values).
 *
 * Duress is never surfaced: naming it would tell whoever is looking that this
 * is the decoy session. It reads as an ordinary "saving" state, while blockers
 * a normal session can also hit (offline, …) still show.
 */
export function netWorthRecorderStatus(input: {
  recordedToday: boolean;
  historyLoading: boolean;
  failed: boolean;
  blockers: readonly NetWorthSnapshotBlocker[];
}): NetWorthRecorderStatus {
  const blockers = [...input.blockers];
  if (input.recordedToday) return { state: "saved", blockers: [] };
  // Until history loads we can't tell whether today is already recorded.
  if (input.historyLoading) return { state: "waiting", blockers };
  if (input.failed) return { state: "failed", blockers };
  const visible = blockers.filter((b) => b !== "duress");
  const lasting = visible.filter((b) => b !== "loading" && b !== "valuationsLoading");
  if (lasting.length > 0) return { state: "blocked", blockers: lasting };
  return { state: "waiting", blockers: visible };
}

const BLOCKER_TEXT: Record<NetWorthSnapshotBlocker, string> = {
  duress: "your accounts are still loading",
  offline: "you're offline",
  loading: "your accounts are still loading",
  valuationsLoading: "investment prices are still loading",
  untrustedBalances: "an account balance needs a rebuild",
  invalidValues: "a total couldn't be valued",
};

/** SPENDLY-620: the one line the card shows about today's point. */
export function netWorthRecorderMessage(status: NetWorthRecorderStatus): string {
  switch (status.state) {
    case "saved":
      return "Today's net worth is saved.";
    case "failed":
      return "Couldn't save today's net worth — it will retry.";
    case "blocked": {
      const names = status.accountNames ?? [];
      if (status.blockers[0] === "untrustedBalances" && names.length > 0) {
        const list = names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2} more` : names.join(" and ");
        return `Today's net worth isn't saved: ${list} ${names.length === 1 ? "has" : "have"} no confirmed balance. Open Accounts → Edit → Rebuild.`;
      }
      return `Today's net worth isn't saved: ${BLOCKER_TEXT[status.blockers[0]]}.`;
    }
    default:
      return "Saving today's net worth…";
  }
}

/**
 * The merge-write that records today's point. `createdAtMs` is only sent when
 * the month document does not exist yet: the rules pin it after creation.
 */
export function netWorthSnapshotWrite(input: {
  todayKey: string;
  totalNetWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  nowMs: number;
  monthDocExists: boolean;
}): { monthKey: string; data: Partial<NetWorthHistoryDoc> & Pick<NetWorthHistoryDoc, "month" | "points"> } {
  if (!DATE_RE.test(input.todayKey)) throw new Error(`Invalid date key: ${input.todayKey}`);
  const monthKey = monthKeyOf(input.todayKey);
  const point: StoredNetWorthPoint = {
    netWorth: roundMoney(input.totalNetWorth),
    assets: roundMoney(input.totalAssets),
    liabilities: roundMoney(input.totalLiabilities),
    recordedAtMs: input.nowMs,
  };
  return {
    monthKey,
    data: {
      month: monthKey,
      points: { [dayKeyOf(input.todayKey)]: point },
      schemaVersion: NET_WORTH_HISTORY_SCHEMA_VERSION,
      updatedAtMs: input.nowMs,
      ...(input.monthDocExists ? {} : { createdAtMs: input.nowMs }),
    },
  };
}

/* --------------------------------------------------------------- reading */

/**
 * Month documents → recorded days, oldest first. Malformed entries (bad keys,
 * impossible days, non-numeric values) are skipped, never guessed at.
 */
export function flattenNetWorthHistory(
  docs: readonly { id: string; data: Partial<NetWorthHistoryDoc> }[]
): NetWorthPoint[] {
  const out: NetWorthPoint[] = [];
  for (const { id, data } of docs) {
    if (!MONTH_RE.test(id)) continue;
    const points = data.points;
    if (!points || typeof points !== "object") continue;
    const [y, m] = id.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    for (const [day, p] of Object.entries(points)) {
      if (!DAY_RE.test(day) || Number(day) > daysInMonth) continue;
      if (!p || !boundedFinite(p.netWorth) || !boundedFinite(p.assets) || !boundedFinite(p.liabilities)) continue;
      out.push({ date: `${id}-${day}`, netWorth: p.netWorth, assets: p.assets, liabilities: p.liabilities });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function hasPointOn(points: readonly NetWorthPoint[], dateKey: string): boolean {
  return points.some((p) => p.date === dateKey);
}

export type NetWorthPeriod = "1W" | "1M" | "3M" | "6M" | "1Y";
export const NET_WORTH_PERIODS: readonly NetWorthPeriod[] = ["1W", "1M", "3M", "6M", "1Y"];
const PERIOD_MONTHS: Record<Exclude<NetWorthPeriod, "1W">, number> = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12 };

/** `dateKey` moved back by whole days. */
export function daysBefore(dateKey: string, days: number): string {
  const d = parseLocalDate(dateKey);
  return toKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - days));
}

function periodStart(todayKey: string, period: NetWorthPeriod): string {
  return period === "1W" ? daysBefore(todayKey, 7) : monthsBefore(todayKey, PERIOD_MONTHS[period]);
}

export type NetWorthTrend = {
  /** Points to draw: the baseline, then every recorded day after it, thinned to `MAX_CHART_POINTS`. */
  series: NetWorthPoint[];
  /** The day the change is measured from. */
  baseline: NetWorthPoint | null;
  latest: NetWorthPoint | null;
  /** latest − baseline; null without two distinct days. */
  change: number | null;
  /** change ÷ |baseline|, as a percentage; null when the baseline is zero. */
  changePct: number | null;
  /** False when history starts after the period's start ("since <baseline date>"). */
  coversFullPeriod: boolean;
};

/**
 * The change over `period`, measured from the last recorded day on or before
 * the period's start (or, with shorter history, the first recorded day in it)
 * to the latest recorded day. Gaps are not filled: the line joins the days
 * that were actually recorded.
 */
export function netWorthTrend(
  points: readonly NetWorthPoint[],
  period: NetWorthPeriod,
  todayKey: string
): NetWorthTrend {
  const start = periodStart(todayKey, period);
  const upToToday = points.filter((p) => p.date <= todayKey);
  const before = upToToday.filter((p) => p.date <= start);
  const inside = upToToday.filter((p) => p.date > start);
  const anchor = before.length > 0 ? before[before.length - 1] : null;
  const series = anchor ? [anchor, ...inside] : inside;
  const baseline = series[0] ?? null;
  const latest = series.length > 0 ? series[series.length - 1] : null;
  const change = baseline && latest && latest.date !== baseline.date ? roundMoney(latest.netWorth - baseline.netWorth) : null;
  const changePct =
    change !== null && baseline && baseline.netWorth !== 0 ? (change / Math.abs(baseline.netWorth)) * 100 : null;
  return {
    series: downsampleSeries(series, MAX_CHART_POINTS),
    baseline,
    latest,
    change,
    changePct,
    coversFullPeriod: anchor !== null,
  };
}

/** Evenly thins a series to at most `max` points, always keeping the first and last. */
export function downsampleSeries<T>(series: readonly T[], max: number): T[] {
  if (max < 2 || series.length <= max) return [...series];
  const out: T[] = [];
  const step = (series.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(series[Math.round(i * step)]);
  return out;
}
