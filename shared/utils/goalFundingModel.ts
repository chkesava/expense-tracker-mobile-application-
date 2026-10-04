/**
 * Goal Funding Optimizer model helpers (SPENDLY-214): snapshotting canonical
 * goals, validating planning inputs and scenarios, and the user-facing text
 * for every assumption. Pure — reads goals, never changes them.
 */

import type { FinancialGoal } from "../types/expense";
import {
  GOAL_FUNDING_MODES,
  type GoalFundingAssumptionCode,
  type GoalFundingScenario,
  type GoalPlanInput,
  type GoalSnapshot,
} from "../types/goalFunding";
import { isValidDateKey } from "./dates";
import { roundMoney } from "./money";

export const GOAL_FUNDING_LIMITS = {
  maxGoals: 50,
  maxAmount: 1_000_000_000_000,
  maxReturnPct: 30,
} as const;

/** Read-only snapshot of goals; the goal records themselves are never touched. */
export function snapshotGoals(goals: readonly FinancialGoal[]): GoalSnapshot[] {
  return goals
    .filter((g) => g.id && Number.isFinite(g.targetAmount))
    .map((g) => ({
      goalId: g.id,
      name: g.name,
      targetAmount: roundMoney(Math.max(0, g.targetAmount)),
      currentAmount: roundMoney(Math.max(0, Number(g.currentAmount) || 0)),
      targetDate: g.deadline && isValidDateKey(g.deadline) ? g.deadline : undefined,
    }))
    .sort((a, b) => a.goalId.localeCompare(b.goalId));
}

const nonNeg = (v: number | undefined) => v === undefined || (Number.isFinite(v) && v >= 0 && v <= GOAL_FUNDING_LIMITS.maxAmount);

/** Problems with one goal's planning input, as sentences. Empty = valid. */
export function validateGoalPlanInput(input: GoalPlanInput): string[] {
  const issues: string[] = [];
  if (!input.goalId) issues.push("Missing goal.");
  if (input.priority !== undefined && (!Number.isInteger(input.priority) || input.priority < 1)) issues.push("Priority must be 1 or more.");
  if (!nonNeg(input.minContribution)) issues.push("The minimum must be zero or more.");
  if (!nonNeg(input.currentContribution)) issues.push("The current contribution must be zero or more.");
  if (input.oneTime && (!nonNeg(input.oneTime.amount) || !isValidDateKey(input.oneTime.date))) issues.push("A one-time contribution needs an amount and a date.");
  if (input.annualReturnPct !== undefined && (!Number.isFinite(input.annualReturnPct) || input.annualReturnPct < 0 || input.annualReturnPct > GOAL_FUNDING_LIMITS.maxReturnPct)) {
    issues.push(`The growth assumption must be between 0% and ${GOAL_FUNDING_LIMITS.maxReturnPct}% a year.`);
  }
  if (input.startDate && !isValidDateKey(input.startDate)) issues.push("The start date must be YYYY-MM-DD.");
  return issues;
}

export function validateScenario(s: GoalFundingScenario): string[] {
  const issues: string[] = [];
  if (!GOAL_FUNDING_MODES.includes(s.mode)) issues.push("Unknown mode.");
  if (s.monthlyPool !== null && !nonNeg(s.monthlyPool)) issues.push("The monthly amount must be zero or more.");
  if (s.inputs.length > GOAL_FUNDING_LIMITS.maxGoals) issues.push(`A plan can cover up to ${GOAL_FUNDING_LIMITS.maxGoals} goals.`);
  const ids = s.inputs.map((i) => i.goalId);
  if (new Set(ids).size !== ids.length) issues.push("Each goal can appear only once.");
  const priorities = s.inputs.map((i) => i.priority).filter((p): p is number => p !== undefined);
  if (new Set(priorities).size !== priorities.length) issues.push("Each priority number can be used once.");
  for (const i of s.inputs) issues.push(...validateGoalPlanInput(i));
  return issues;
}

/** Inputs for every goal, keeping the user's entries and adding blanks for new goals. */
export function inputsForGoals(goals: readonly GoalSnapshot[], existing: readonly GoalPlanInput[]): GoalPlanInput[] {
  const byId = new Map(existing.map((i) => [i.goalId, i]));
  return goals.map((g) => byId.get(g.goalId) ?? { goalId: g.goalId });
}

export const GOAL_FUNDING_ASSUMPTIONS: Record<GoalFundingAssumptionCode, string> = {
  current_contribution_unknown: "You haven't said what you put into some goals today, so the change from your current plan can't be shown for them.",
  capacity_unknown: "Spendly can't work out how much you have available each month yet, so enter an amount to plan with.",
  capacity_non_positive: "Your typical spending is at or above your income, so there's no surplus to share between goals.",
  growth_assumed: "Some goals use a growth rate you entered. Growth is an assumption, not a guarantee, and tax and fees aren't modelled.",
  over_allocation_hypothetical: "This scenario allocates more than you have available — a what-if, not a plan you can follow today.",
  no_priority_given: "No priority order was given, so no goal is put ahead of another.",
  target_date_missing: "Some goals have no target date, so a required monthly amount can't be calculated for them.",
  target_date_passed: "Some goals' target dates have passed; they're shown with the amount still needed.",
};
