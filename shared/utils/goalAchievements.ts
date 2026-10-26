/**
 * SPENDLY-610 — milestones, completion and achievements, as pure logic.
 *
 * Reached state is derived from the saved amount (goalMilestones.ts); what
 * this module adds is what the user sees:
 *   - which celebration a just-committed write deserves (at most one);
 *   - a guard so the same achievement is never celebrated twice;
 *   - whether a write just reached the target (→ ask to mark completed);
 *   - the milestone list with progress, and the completion summary.
 */

import type { FinancialGoal } from "../types/expense";
import { GOAL_LIMITS, type GoalEvent, type GoalMilestone } from "../types/goal";
import { goalMilestones, reachedMilestoneIds } from "./goalMilestones";
import { goalProgress, isGoalInProgress, parseGoalAmount, validatePositiveAmount } from "./goalModel";
import { roundMoney } from "./money";

export type GoalCelebration = {
  /** The event that earned it; the de-duplication key. */
  eventId: string;
  kind: "completed" | "milestone";
  title: string;
  subtitle: string;
  badgeEmoji: string;
  /** Amounts the subtitle mentions ({0}, {1}…), formatted by the UI. */
  amounts: number[];
};

/**
 * The one celebration a committed write deserves: completion beats any
 * milestone; among milestones, the highest one reached. Nothing for losses.
 */
export function celebrationFor(goalName: string, events: readonly GoalEvent[]): GoalCelebration | null {
  const completed = events.find((e) => e.type === "completed");
  if (completed) {
    return {
      eventId: completed.id,
      kind: "completed",
      title: "Goal completed!",
      subtitle: `You did it — "${goalName}" is complete.`,
      badgeEmoji: "🏆",
      amounts: [],
    };
  }
  const reached = events
    .filter((e) => e.type === "milestone_reached")
    .sort((a, b) => (b.milestoneAmount ?? 0) - (a.milestoneAmount ?? 0))[0];
  if (!reached) return null;
  return {
    eventId: reached.id,
    kind: "milestone",
    title: "Milestone reached",
    subtitle: `"${goalName}" just passed {0}.`,
    badgeEmoji: "🎯",
    amounts: [reached.milestoneAmount ?? 0],
  };
}

/**
 * Remembers which achievements were already celebrated on this device, so a
 * re-render, a retried submit or a second listener callback never repeats
 * one. Bounded so it can't grow without limit in a long session.
 */
export class CelebrationGuard {
  private readonly seen: string[] = [];
  constructor(private readonly capacity = 200) {}

  /** True the first time an id is offered, false afterwards. */
  claim(eventId: string): boolean {
    if (this.seen.includes(eventId)) return false;
    this.seen.push(eventId);
    if (this.seen.length > this.capacity) this.seen.shift();
    return true;
  }
}

/** Did this write take an open goal from below its target to at or above it? */
export function targetJustReached(before: Pick<FinancialGoal, "currentAmount" | "targetAmount" | "status">, delta: number): boolean {
  if (!isGoalInProgress(before) || delta <= 0) return false;
  const p = goalProgress(before);
  return p.target > 0 && p.saved < p.target && roundMoney(p.saved + delta) >= p.target;
}

export type MilestoneRow = GoalMilestone & { reached: boolean; percentOfTarget: number };

export type MilestoneStatus = {
  rows: MilestoneRow[];
  reachedCount: number;
  next: MilestoneRow | null;
  /** Still to save to reach `next`. */
  toNext: number;
  custom: boolean;
};

export function milestoneStatus(goal: Pick<FinancialGoal, "milestones" | "targetAmount" | "currentAmount">): MilestoneStatus {
  const list = goalMilestones(goal);
  const saved = goalProgress(goal).saved;
  const reached = reachedMilestoneIds(list, saved);
  const rows = list.map((m) => ({
    ...m,
    reached: reached.has(m.id),
    percentOfTarget: goal.targetAmount > 0 ? Math.round((m.amount / goal.targetAmount) * 100) : 0,
  }));
  const next = rows.find((r) => !r.reached) ?? null;
  return {
    rows,
    reachedCount: reached.size,
    next,
    toNext: next ? roundMoney(Math.max(0, next.amount - saved)) : 0,
    custom: Boolean(goal.milestones && goal.milestones.length > 0),
  };
}

export type CompletionSummary = {
  target: number;
  finalAmount: number;
  surplus: number;
  /** Days from creation to completion, when both are known. */
  days: number | null;
  completedAtMs: number | null;
  milestonesReached: number;
  milestonesTotal: number;
};

/** Summary-only (no history read): what the completed goal's page shows. */
export function completionSummary(goal: FinancialGoal): CompletionSummary {
  const p = goalProgress(goal);
  const ms = milestoneStatus(goal);
  const created = typeof goal.createdAtMs === "number" ? goal.createdAtMs : null;
  const done = typeof goal.completedAtMs === "number" ? goal.completedAtMs : null;
  return {
    target: p.target,
    finalAmount: p.saved,
    surplus: p.surplus,
    days: created !== null && done !== null && done >= created ? Math.max(1, Math.round((done - created) / 86_400_000)) : null,
    completedAtMs: done,
    milestonesReached: ms.reachedCount,
    milestonesTotal: ms.rows.length,
  };
}

// ---------------------------------------------------------------------------
// Milestone editor form
// ---------------------------------------------------------------------------

export type MilestoneFormRow = { id: string; amount: string; label: string };

export function milestoneFormRows(goal: Pick<FinancialGoal, "milestones" | "targetAmount">): MilestoneFormRow[] {
  return goalMilestones(goal).map((m) => ({ id: m.id, amount: String(m.amount), label: m.label ?? "" }));
}

/** Next free id for a row added in the editor (`m1`, `m2`, …; never reuses a default `p…` id). */
export function nextMilestoneId(rows: readonly { id: string }[]): string {
  let n = 1;
  const ids = new Set(rows.map((r) => r.id));
  while (ids.has(`m${n}`)) n += 1;
  return `m${n}`;
}

export type ParsedMilestones = { ok: true; milestones: GoalMilestone[] } | { ok: false; errors: Record<string, string> };

/**
 * Validates editor rows. Amounts must be positive and distinct; they may be
 * above the target (a stretch milestone). Keeps each row's id, so a milestone
 * the user only relabels keeps its achievement history.
 */
export function parseMilestoneRows(rows: readonly MilestoneFormRow[]): ParsedMilestones {
  const errors: Record<string, string> = {};
  if (rows.length > GOAL_LIMITS.maxMilestones) errors._ = `Use at most ${GOAL_LIMITS.maxMilestones} milestones.`;
  const seen = new Set<number>();
  const milestones: GoalMilestone[] = [];
  for (const row of rows) {
    const amount = parseGoalAmount(row.amount);
    if (validatePositiveAmount(amount).length) {
      errors[row.id] = "Enter an amount above zero.";
      continue;
    }
    if (seen.has(amount)) {
      errors[row.id] = "Two milestones can't have the same amount.";
      continue;
    }
    if (row.label.length > GOAL_LIMITS.milestoneLabelMax) {
      errors[row.id] = `Keep the label under ${GOAL_LIMITS.milestoneLabelMax} characters.`;
      continue;
    }
    seen.add(amount);
    milestones.push({ id: row.id, amount, ...(row.label.trim() ? { label: row.label.trim() } : {}) });
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, milestones: milestones.sort((a, b) => a.amount - b.amount) };
}
