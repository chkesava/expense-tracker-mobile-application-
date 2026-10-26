/**
 * SPENDLY-611 — Save Goals analytics (FRD FR-09), pure.
 *
 * Inputs: the goal summaries (current state, from Firestore) and the goal
 * events inside a date range (from the read path: Firestore by default, the
 * read model when the `goals` screen is flipped). Every total here is computed
 * from those rows by this module (READ_MODEL_RULES R3.6); nothing is summed in
 * SQL for display.
 *
 * Money movement is classified by the sign of each event's `amountDelta`:
 * increases (contributions, a starting amount, upward corrections) and
 * decreases (reductions, downward corrections and reversals). Net growth is
 * their sum, which is exactly how the saved amount moved.
 */

import type { FinancialGoal } from "../types/expense";
import { GOAL_STATUSES, type GoalEvent, type GoalStatus } from "../types/goal";
import { goalStatus } from "./goalModel";
import { reconcileGoal } from "./goalReconcile";
import { roundMoney } from "./money";

// ---------------------------------------------------------------------------
// Date ranges
// ---------------------------------------------------------------------------

export const GOAL_RANGE_PRESETS = ["all", "month", "quarter", "year", "custom"] as const;
export type GoalRangePreset = (typeof GOAL_RANGE_PRESETS)[number];

export type GoalRange = {
  preset: GoalRangePreset;
  /** Inclusive start, epoch ms (local midnight). */
  fromMs: number;
  /** Exclusive end, epoch ms. */
  toMs: number;
  label: string;
  /** The period just before, of the same kind, for comparison; null for all-time. */
  previous: { fromMs: number; toMs: number; label: string } | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const local = (y: number, m: number, d = 1) => new Date(y, m, d).getTime();
const monthLabel = (y: number, m: number) => `${MONTHS[((m % 12) + 12) % 12]} ${new Date(y, m, 1).getFullYear()}`;

function parseDay(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const ms = local(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The range for a preset, in the device's local time. `custom` takes two
 * `YYYY-MM-DD` keys (inclusive); an invalid or reversed custom range is null.
 */
export function goalRange(
  preset: GoalRangePreset,
  nowMs: number,
  custom?: { from: string; to: string }
): GoalRange | null {
  const now = new Date(nowMs);
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "all":
      return { preset, fromMs: 0, toMs: local(y, m, now.getDate() + 1), label: "All time", previous: null };
    case "month":
      return {
        preset,
        fromMs: local(y, m),
        toMs: local(y, m + 1),
        label: monthLabel(y, m),
        previous: { fromMs: local(y, m - 1), toMs: local(y, m), label: monthLabel(y, m - 1) },
      };
    case "quarter": {
      const q = Math.floor(m / 3);
      const prevYear = q === 0 ? y - 1 : y;
      const prevQ = (q + 3) % 4;
      return {
        preset,
        fromMs: local(y, q * 3),
        toMs: local(y, q * 3 + 3),
        label: `Q${q + 1} ${y}`,
        previous: { fromMs: local(prevYear, prevQ * 3), toMs: local(prevYear, prevQ * 3 + 3), label: `Q${prevQ + 1} ${prevYear}` },
      };
    }
    case "year":
      return {
        preset,
        fromMs: local(y, 0),
        toMs: local(y + 1, 0),
        label: String(y),
        previous: { fromMs: local(y - 1, 0), toMs: local(y, 0), label: String(y - 1) },
      };
    case "custom": {
      const from = custom ? parseDay(custom.from) : null;
      const toDay = custom ? parseDay(custom.to) : null;
      if (from === null || toDay === null || from > toDay) return null;
      const to = new Date(toDay);
      const toMs = local(to.getFullYear(), to.getMonth(), to.getDate() + 1);
      const span = toMs - from;
      return {
        preset,
        fromMs: from,
        toMs,
        label: `${custom!.from} – ${custom!.to}`,
        previous: { fromMs: from - span, toMs: from, label: "Previous period" },
      };
    }
  }
}

export function inRange(e: Pick<GoalEvent, "createdAtMs">, range: { fromMs: number; toMs: number }): boolean {
  return e.createdAtMs >= range.fromMs && e.createdAtMs < range.toMs;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export type GoalMonthRow = { key: string; increased: number; decreased: number; net: number };
export type GoalBreakdownRow = { goalId: string; name: string; status: GoalStatus; increased: number; decreased: number; net: number };

export type GoalAnalytics = {
  goalCount: number;
  statusCounts: Record<GoalStatus, number>;
  increased: number;
  decreased: number;
  net: number;
  contributionCount: number;
  reductionCount: number;
  /** Average plain contribution in the range; null with none. */
  averageContribution: number | null;
  completions: number;
  milestonesReached: number;
  milestonesLost: number;
  /** Completed goals ÷ goals in scope (current state), 0..1; null with no goals. */
  completionRate: number | null;
  /** Per local month, oldest first, with a running total of net growth. */
  months: (GoalMonthRow & { cumulative: number })[];
  perGoal: GoalBreakdownRow[];
};

function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Goals whose status is in `statuses` (all statuses when empty). */
export function goalsInScope(goals: readonly FinancialGoal[], statuses: readonly GoalStatus[]): FinancialGoal[] {
  return statuses.length === 0 ? [...goals] : goals.filter((g) => statuses.includes(goalStatus(g)));
}

export function analyzeGoals(
  goals: readonly FinancialGoal[],
  events: readonly GoalEvent[],
  options: { statuses: readonly GoalStatus[]; range: { fromMs: number; toMs: number } }
): GoalAnalytics {
  const scope = goalsInScope(goals, options.statuses);
  const ids = new Set(scope.map((g) => g.id));
  const names = new Map(scope.map((g) => [g.id, g]));
  const statusCounts = Object.fromEntries(GOAL_STATUSES.map((s) => [s, 0])) as Record<GoalStatus, number>;
  for (const g of scope) statusCounts[goalStatus(g)] += 1;

  let increased = 0;
  let decreased = 0;
  let contributionCount = 0;
  let contributionSum = 0;
  let reductionCount = 0;
  let completions = 0;
  let milestonesReached = 0;
  let milestonesLost = 0;
  const byMonth = new Map<string, GoalMonthRow>();
  const byGoal = new Map<string, GoalBreakdownRow>();

  for (const e of events) {
    if (!ids.has(e.goalId) || !inRange(e, options.range)) continue;
    if (e.type === "completed") completions += 1;
    if (e.type === "milestone_reached") milestonesReached += 1;
    if (e.type === "milestone_lost") milestonesLost += 1;
    const delta = typeof e.amountDelta === "number" && Number.isFinite(e.amountDelta) ? e.amountDelta : 0;
    if (delta === 0) continue;
    if (e.type === "contribution") {
      contributionCount += 1;
      contributionSum += delta;
    }
    if (e.type === "reduction") reductionCount += 1;
    const up = delta > 0 ? delta : 0;
    const down = delta < 0 ? -delta : 0;
    increased += up;
    decreased += down;
    const mk = monthKey(e.createdAtMs);
    const mrow = byMonth.get(mk) ?? { key: mk, increased: 0, decreased: 0, net: 0 };
    mrow.increased += up;
    mrow.decreased += down;
    mrow.net += delta;
    byMonth.set(mk, mrow);
    const goal = names.get(e.goalId)!;
    const grow = byGoal.get(e.goalId) ?? { goalId: e.goalId, name: goal.name, status: goalStatus(goal), increased: 0, decreased: 0, net: 0 };
    grow.increased += up;
    grow.decreased += down;
    grow.net += delta;
    byGoal.set(e.goalId, grow);
  }

  let running = 0;
  const months = [...byMonth.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((m) => {
      running += m.net;
      return { key: m.key, increased: roundMoney(m.increased), decreased: roundMoney(m.decreased), net: roundMoney(m.net), cumulative: roundMoney(running) };
    });

  return {
    goalCount: scope.length,
    statusCounts,
    increased: roundMoney(increased),
    decreased: roundMoney(decreased),
    net: roundMoney(increased - decreased),
    contributionCount,
    reductionCount,
    averageContribution: contributionCount ? roundMoney(contributionSum / contributionCount) : null,
    completions,
    milestonesReached,
    milestonesLost,
    completionRate: scope.length ? statusCounts.completed / scope.length : null,
    months,
    perGoal: [...byGoal.values()]
      .map((r) => ({ ...r, increased: roundMoney(r.increased), decreased: roundMoney(r.decreased), net: roundMoney(r.net) }))
      .sort((a, b) => b.net - a.net || a.name.localeCompare(b.name)),
  };
}

export type PeriodComparison = {
  net: { current: number; previous: number; change: number | null };
  increased: { current: number; previous: number; change: number | null };
  contributions: { current: number; previous: number };
};

/** Change as a fraction of the previous period; null when the previous was 0. */
function change(current: number, previous: number): number | null {
  return previous === 0 ? null : (current - previous) / Math.abs(previous);
}

export function comparePeriods(current: GoalAnalytics, previous: GoalAnalytics): PeriodComparison {
  return {
    net: { current: current.net, previous: previous.net, change: change(current.net, previous.net) },
    increased: { current: current.increased, previous: previous.increased, change: change(current.increased, previous.increased) },
    contributions: { current: current.contributionCount, previous: previous.contributionCount },
  };
}

/**
 * All-time check that each goal's saved amount equals its opening amount plus
 * its history (FRD AC: totals reconcile with the audit history and the
 * summary). Only meaningful over the complete history; callers skip it when
 * the event list was truncated.
 */
export function reconcileGoals(goals: readonly FinancialGoal[], events: readonly GoalEvent[]): { goalId: string; name: string; difference: number }[] {
  const byGoal = new Map<string, GoalEvent[]>();
  for (const e of events) {
    const list = byGoal.get(e.goalId) ?? [];
    list.push(e);
    byGoal.set(e.goalId, list);
  }
  return goals
    .map((g) => ({ g, r: reconcileGoal(g, byGoal.get(g.id) ?? []) }))
    .filter(({ r }) => !r.ok)
    .map(({ g, r }) => ({ goalId: g.id, name: g.name, difference: r.difference }));
}

/** A plain-language summary for screen readers (the chart's text alternative). */
export function analyticsSummaryText(a: GoalAnalytics, rangeLabel: string, money: (n: number) => string): string {
  if (a.goalCount === 0) return `No goals match these filters for ${rangeLabel}.`;
  const parts = [
    `${rangeLabel}: ${a.goalCount} ${a.goalCount === 1 ? "goal" : "goals"}.`,
    `Saved ${money(a.increased)} and took out ${money(a.decreased)}, net ${a.net < 0 ? "minus " : ""}${money(Math.abs(a.net))}.`,
    `${a.contributionCount} ${a.contributionCount === 1 ? "contribution" : "contributions"}.`,
  ];
  if (a.completions) parts.push(`${a.completions} ${a.completions === 1 ? "goal" : "goals"} completed.`);
  if (a.milestonesReached) parts.push(`${a.milestonesReached} ${a.milestonesReached === 1 ? "milestone" : "milestones"} reached.`);
  const best = a.months.reduce<(typeof a.months)[number] | null>((m, r) => (!m || r.net > m.net ? r : m), null);
  if (best && a.months.length > 1) parts.push(`Best month ${best.key}, net ${money(best.net)}.`);
  return parts.join(" ");
}
