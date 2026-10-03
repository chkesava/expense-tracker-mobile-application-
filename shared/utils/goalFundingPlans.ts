/**
 * Saved goal funding plans (SPENDLY-220). Pure: the exact Firestore document,
 * restoring a plan into the screen, duplicating, and spotting goals that
 * changed since a plan was saved. A plan only ever stores planning inputs and
 * a snapshot of goal values — never a goal, contribution or transaction.
 *
 * Stored at users/{uid}/goalFundingPlans/{id}; validated by
 * `goalFundingPlanWellFormed` in firestore.rules.
 */

import { GOAL_FUNDING_ENGINE_VERSION, GOAL_FUNDING_MODES, type GoalFundingMode, type GoalPlanInput, type GoalSnapshot } from "../types/goalFunding";
import { GOAL_FUNDING_LIMITS } from "./goalFundingModel";
import { roundMoney } from "./money";

export const PLAN_NAME_MAX = 80;

export interface GoalFundingPlanDoc {
  name: string;
  mode: GoalFundingMode;
  /** The user's own monthly amount, if they typed one. */
  plannedMonthly?: number;
  allowOverAllocation: boolean;
  inputs: GoalPlanInput[];
  /** Goal values when the plan was last saved — used to show what changed. */
  goalSnapshot: GoalSnapshot[];
  engineVersion: number;
  archived: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface GoalFundingPlan extends GoalFundingPlanDoc {
  id: string;
}

export function validatePlanName(name: string): string | null {
  const t = name.trim();
  if (!t) return "Give the plan a name.";
  if (t.length > PLAN_NAME_MAX) return `Keep the name under ${PLAN_NAME_MAX} characters.`;
  return null;
}

/** An input with only its set fields — Firestore never receives `undefined`. */
function cleanInput(i: GoalPlanInput): GoalPlanInput {
  const out: GoalPlanInput = { goalId: i.goalId };
  if (i.priority !== undefined) out.priority = i.priority;
  if (i.minContribution !== undefined) out.minContribution = roundMoney(i.minContribution);
  if (i.currentContribution !== undefined) out.currentContribution = roundMoney(i.currentContribution);
  if (i.oneTime) out.oneTime = { amount: roundMoney(i.oneTime.amount), date: i.oneTime.date };
  if (i.annualReturnPct !== undefined) out.annualReturnPct = i.annualReturnPct;
  if (i.startDate) out.startDate = i.startDate;
  if (i.excluded) out.excluded = true;
  return out;
}

function cleanSnapshot(g: GoalSnapshot): GoalSnapshot {
  const out: GoalSnapshot = { goalId: g.goalId, name: g.name, targetAmount: g.targetAmount, currentAmount: g.currentAmount };
  if (g.targetDate) out.targetDate = g.targetDate;
  return out;
}

/** The exact document to write. Inputs for deleted goals and empty inputs are dropped. */
export function goalFundingPlanDoc(input: {
  name: string;
  mode: GoalFundingMode;
  plannedMonthly: number | null;
  allowOverAllocation: boolean;
  inputs: readonly GoalPlanInput[];
  goals: readonly GoalSnapshot[];
  nowMs: number;
  existing?: Pick<GoalFundingPlanDoc, "createdAtMs" | "archived">;
}): GoalFundingPlanDoc {
  const goalIds = new Set(input.goals.map((g) => g.goalId));
  const inputs = input.inputs
    .filter((i) => goalIds.has(i.goalId))
    .map(cleanInput)
    .filter((i) => Object.keys(i).length > 1)
    .slice(0, GOAL_FUNDING_LIMITS.maxGoals);
  const doc: GoalFundingPlanDoc = {
    name: input.name.trim().slice(0, PLAN_NAME_MAX),
    mode: GOAL_FUNDING_MODES.includes(input.mode) ? input.mode : "balanced",
    allowOverAllocation: input.allowOverAllocation,
    inputs,
    goalSnapshot: input.goals.slice(0, GOAL_FUNDING_LIMITS.maxGoals).map(cleanSnapshot),
    engineVersion: GOAL_FUNDING_ENGINE_VERSION,
    archived: input.existing?.archived ?? false,
    createdAtMs: input.existing?.createdAtMs ?? input.nowMs,
    updatedAtMs: input.nowMs,
  };
  if (input.plannedMonthly !== null && Number.isFinite(input.plannedMonthly)) doc.plannedMonthly = roundMoney(input.plannedMonthly);
  return doc;
}

/** A copy with a new name and fresh timestamps; independent of the original. */
export function duplicatePlanDoc(plan: GoalFundingPlanDoc, name: string, nowMs: number): GoalFundingPlanDoc {
  return {
    ...JSON.parse(JSON.stringify(plan)),
    name: name.trim().slice(0, PLAN_NAME_MAX),
    archived: false,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  };
}

export type GoalChangeKind = "added" | "removed" | "target_changed" | "saved_changed" | "date_changed" | "renamed";

export interface GoalChange {
  goalId: string;
  name: string;
  kinds: GoalChangeKind[];
}

/** What changed in the goals since the plan was saved. Results are always recalculated from today's goals. */
export function goalsChangedSince(saved: readonly GoalSnapshot[], current: readonly GoalSnapshot[]): GoalChange[] {
  const before = new Map(saved.map((g) => [g.goalId, g]));
  const now = new Map(current.map((g) => [g.goalId, g]));
  const out: GoalChange[] = [];
  for (const g of current) {
    const b = before.get(g.goalId);
    if (!b) {
      out.push({ goalId: g.goalId, name: g.name, kinds: ["added"] });
      continue;
    }
    const kinds: GoalChangeKind[] = [];
    if (b.targetAmount !== g.targetAmount) kinds.push("target_changed");
    if (b.currentAmount !== g.currentAmount) kinds.push("saved_changed");
    if ((b.targetDate ?? "") !== (g.targetDate ?? "")) kinds.push("date_changed");
    if (b.name !== g.name) kinds.push("renamed");
    if (kinds.length) out.push({ goalId: g.goalId, name: g.name, kinds });
  }
  for (const b of saved) if (!now.has(b.goalId)) out.push({ goalId: b.goalId, name: b.name, kinds: ["removed"] });
  return out.sort((a, b) => a.goalId.localeCompare(b.goalId));
}

export const GOAL_CHANGE_LABELS: Record<GoalChangeKind, string> = {
  added: "new goal since this plan was saved",
  removed: "goal deleted since this plan was saved",
  target_changed: "target changed",
  saved_changed: "amount saved changed",
  date_changed: "target date changed",
  renamed: "renamed",
};

/** Plans newest first; archived after active. */
export function sortPlans(plans: readonly GoalFundingPlan[]): GoalFundingPlan[] {
  return [...plans].sort((a, b) => Number(a.archived) - Number(b.archived) || b.updatedAtMs - a.updatedAtMs || a.id.localeCompare(b.id));
}
