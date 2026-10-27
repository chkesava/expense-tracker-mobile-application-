/**
 * SPENDLY-607 — Save Goals lifecycle. Mirrored by firestore.rules (SPENDLY-608).
 *
 *   active ⇄ paused
 *   active | paused  → completed   (only once the target is reached)
 *   completed        → active      ("reopen": the only way to fix a completed goal's amount)
 *   active | paused  → cancelled
 *   cancelled        → active      (restore)
 *   any but archived → archived    (restores to the status it was archived from)
 *
 * There is no delete: a goal and its history are kept for good (FRD FR-06).
 */

import type { FinancialGoal } from "../types/expense";
import type { GoalStatus } from "../types/goal";
import { goalProgress, goalStatus } from "./goalModel";

const TRANSITIONS: Readonly<Record<Exclude<GoalStatus, "archived">, readonly GoalStatus[]>> = {
  active: ["paused", "completed", "cancelled", "archived"],
  paused: ["active", "completed", "cancelled", "archived"],
  completed: ["active", "archived"],
  cancelled: ["active", "archived"],
};

/** Exported for the TS↔rules contract test. */
export const GOAL_TRANSITIONS = TRANSITIONS;

export type GoalTransitionCheck = { ok: true } | { ok: false; issue: "transition_not_allowed" | "target_not_reached" };

export function checkGoalTransition(
  goal: Pick<FinancialGoal, "status" | "statusBeforeArchive" | "currentAmount" | "targetAmount">,
  to: GoalStatus
): GoalTransitionCheck {
  const from = goalStatus(goal);
  if (from === to) return { ok: false, issue: "transition_not_allowed" };
  if (from === "archived") {
    const back = goal.statusBeforeArchive ?? "active";
    return to === back ? { ok: true } : { ok: false, issue: "transition_not_allowed" };
  }
  if (!TRANSITIONS[from].includes(to)) return { ok: false, issue: "transition_not_allowed" };
  if (to === "completed" && !goalProgress(goal).reached) return { ok: false, issue: "target_not_reached" };
  return { ok: true };
}

/** Actions offered for a goal, in display order. */
export type GoalAction = "pause" | "resume" | "complete" | "reopen" | "cancel" | "restore" | "archive" | "unarchive";

export function actionTarget(
  goal: Pick<FinancialGoal, "status" | "statusBeforeArchive">,
  action: GoalAction
): GoalStatus {
  switch (action) {
    case "pause":
      return "paused";
    case "resume":
    case "reopen":
    case "restore":
      return "active";
    case "complete":
      return "completed";
    case "cancel":
      return "cancelled";
    case "archive":
      return "archived";
    case "unarchive":
      return goal.statusBeforeArchive ?? "active";
  }
}

export function availableGoalActions(
  goal: Pick<FinancialGoal, "status" | "statusBeforeArchive" | "currentAmount" | "targetAmount">
): GoalAction[] {
  const from = goalStatus(goal);
  const candidates: GoalAction[] =
    from === "active"
      ? ["complete", "pause", "cancel", "archive"]
      : from === "paused"
        ? ["resume", "complete", "cancel", "archive"]
        : from === "completed"
          ? ["reopen", "archive"]
          : from === "cancelled"
            ? ["restore", "archive"]
            : ["unarchive"];
  return candidates.filter((a) => checkGoalTransition(goal, actionTarget(goal, a)).ok);
}
