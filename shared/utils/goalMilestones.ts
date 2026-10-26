/**
 * SPENDLY-607 — Save Goals milestones (behaviour lands in SPENDLY-610).
 *
 * Configuration lives on the goal (`milestones`). When it is absent the goal
 * uses the defaults — 25/50/75/100% of the *current* target — so a target
 * change moves default milestones with it.
 *
 * Whether a milestone is reached is DERIVED from the saved amount and never
 * stored, so it cannot drift. What is stored is history: a `milestone_reached`
 * or `milestone_lost` event each time the saved amount crosses a threshold.
 * Crossing events get deterministic ids derived from the event that caused
 * them, so a retried write can never record (or celebrate) one twice.
 */

import type { FinancialGoal } from "../types/expense";
import { GOAL_LIMITS, type GoalMilestone } from "../types/goal";
import { roundMoney } from "./money";
import type { GoalIssue } from "./goalModel";

export const DEFAULT_MILESTONE_PERCENTS = [25, 50, 75, 100] as const;

export function defaultMilestones(targetAmount: number): GoalMilestone[] {
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) return [];
  return DEFAULT_MILESTONE_PERCENTS.map((pct) => ({
    id: `p${pct}`,
    amount: roundMoney((targetAmount * pct) / 100),
    label: `${pct}%`,
  }));
}

/** The milestones in force for a goal: its custom list, else the defaults. */
export function goalMilestones(goal: Pick<FinancialGoal, "milestones" | "targetAmount">): GoalMilestone[] {
  const list = goal.milestones && goal.milestones.length > 0 ? goal.milestones : defaultMilestones(goal.targetAmount);
  return [...list].sort((a, b) => a.amount - b.amount || a.id.localeCompare(b.id));
}

const MILESTONE_ID = /^[A-Za-z0-9_-]{1,24}$/;

export function validateMilestones(milestones: readonly GoalMilestone[]): GoalIssue[] {
  if (milestones.length > GOAL_LIMITS.maxMilestones) return ["milestones_invalid"];
  const ids = new Set<string>();
  for (const m of milestones) {
    if (!MILESTONE_ID.test(m.id) || ids.has(m.id)) return ["milestones_invalid"];
    ids.add(m.id);
    if (!Number.isFinite(m.amount) || m.amount <= 0 || m.amount > GOAL_LIMITS.maxAmount) return ["milestones_invalid"];
    if (m.label !== undefined && (typeof m.label !== "string" || m.label.length > GOAL_LIMITS.milestoneLabelMax)) {
      return ["milestones_invalid"];
    }
  }
  return [];
}

export function reachedMilestoneIds(milestones: readonly GoalMilestone[], savedAmount: number): Set<string> {
  return new Set(milestones.filter((m) => savedAmount >= m.amount).map((m) => m.id));
}

export type MilestoneCrossing = {
  /** Deterministic: `${causeEventId}__ms_${milestoneId}`. */
  eventId: string;
  type: "milestone_reached" | "milestone_lost";
  milestoneId: string;
  milestoneAmount: number;
};

/**
 * Crossings between two states of a goal. `before` and `after` may differ in
 * saved amount (a contribution), in milestones (a target change or an edit),
 * or both. Only milestones present in `after` are considered: removing a
 * milestone is configuration, not a drop in progress, so it records nothing.
 */
export function milestoneCrossings(
  before: { milestones: readonly GoalMilestone[]; saved: number },
  after: { milestones: readonly GoalMilestone[]; saved: number },
  causeEventId: string
): MilestoneCrossing[] {
  const wasReached = reachedMilestoneIds(before.milestones, before.saved);
  const isReached = reachedMilestoneIds(after.milestones, after.saved);
  const out: MilestoneCrossing[] = [];
  for (const m of [...after.milestones].sort((a, b) => a.amount - b.amount || a.id.localeCompare(b.id))) {
    const now = isReached.has(m.id);
    const then = wasReached.has(m.id);
    if (now === then) continue;
    out.push({
      eventId: `${causeEventId}__ms_${m.id}`,
      type: now ? "milestone_reached" : "milestone_lost",
      milestoneId: m.id,
      milestoneAmount: m.amount,
    });
  }
  return out;
}
