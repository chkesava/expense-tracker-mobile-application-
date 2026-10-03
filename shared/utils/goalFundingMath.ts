/**
 * Target-date funding maths and funding-gap analysis for one goal
 * (SPENDLY-216). Pure and deterministic; never changes a goal.
 *
 * Model: one contribution per month, on the plan's start day (clamped to
 * short months), starting at `startDate` (default: today). The number of
 * contributions before a target date is counted with the shared schedule
 * helper, so month ends and leap years behave like the rest of Spendly.
 *
 * Growth (optional, investment-linked goals only): an annual rate converted
 * to a monthly rate; the saved amount, contributions and any one-time top-up
 * grow until the target date. It is an assumption — never a guarantee — and
 * tax and fees are not modelled.
 *
 * Rounding: required amounts are rounded UP to the paisa so following them
 * never falls short by rounding.
 */

import type { GoalFundingResult, GoalPlanInput, GoalSnapshot } from "../types/goalFunding";
import { daysBetweenDateKeys, shiftMonthKey } from "./dates";
import { roundMoney } from "./money";
import { occurrencesBetween } from "./runwayEngine";

/** Longest projection we compute (50 years). */
export const MAX_PROJECTION_MONTHS = 600;

const ceilMoney = (v: number) => Math.ceil(Math.round(v * 1e6) / 1e4) / 100;

export function monthlyRate(annualReturnPct: number | undefined): number {
  return annualReturnPct ? Math.pow(1 + annualReturnPct / 100, 1 / 12) - 1 : 0;
}

/** Contribution dates from `start` up to and including `until`. */
export function contributionDates(start: string, until: string): string[] {
  if (until < start) return [];
  return occurrencesBetween({ kind: "monthly", firstDate: start, dayOfMonth: Number(start.slice(8, 10)) }, start, until);
}

/** Whole months between two dates (by calendar month), negative if `to` is earlier. */
export function monthsBetween(from: string, to: string): number {
  const months = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + (Number(to.slice(5, 7)) - Number(from.slice(5, 7)));
  return to.slice(8) < from.slice(8) && months > 0 ? months - 1 : months;
}

function growthFactor(i: number, months: number): number {
  return Math.pow(1 + i, Math.max(0, months));
}

/** Amount still needed after what's saved and any one-time top-up dated by the target (no growth). */
export function remainingAmount(goal: GoalSnapshot, input: GoalPlanInput): number {
  const oneTime = input.oneTime && (!goal.targetDate || input.oneTime.date <= goal.targetDate) ? input.oneTime.amount : 0;
  return roundMoney(Math.max(0, goal.targetAmount - goal.currentAmount - oneTime));
}

/**
 * Monthly contribution needed to reach the target by its date.
 * Returns null without a target date; with a past date, the whole remaining amount (one payment).
 */
export function requiredMonthly(goal: GoalSnapshot, input: GoalPlanInput, today: string): { amount: number | null; contributions: number } {
  if (!goal.targetDate) return { amount: null, contributions: 0 };
  const start = input.startDate ?? today;
  const i = monthlyRate(input.annualReturnPct);
  const dates = contributionDates(start, goal.targetDate);
  const n = dates.length;
  // Value at the target date of what's already there.
  const monthsToTarget = Math.max(0, monthsBetween(today, goal.targetDate));
  const savedFv = goal.currentAmount * growthFactor(i, monthsToTarget);
  const oneTimeFv =
    input.oneTime && input.oneTime.date <= goal.targetDate ? input.oneTime.amount * growthFactor(i, monthsBetween(input.oneTime.date, goal.targetDate)) : 0;
  const shortfall = goal.targetAmount - savedFv - oneTimeFv;
  if (shortfall <= 0) return { amount: 0, contributions: n };
  if (n === 0) return { amount: ceilMoney(shortfall), contributions: 0 };
  // Each contribution grows from its own date to the target.
  const fvPerUnit = dates.reduce((t, d) => t + growthFactor(i, monthsBetween(d, goal.targetDate!)), 0);
  return { amount: ceilMoney(shortfall / fvPerUnit), contributions: n };
}

/**
 * When the goal is reached at `monthly` per month (with growth and one-time
 * top-up), or null if it never is within 50 years.
 */
export function projectCompletion(goal: GoalSnapshot, input: GoalPlanInput, monthly: number, today: string): string | null {
  if (goal.currentAmount >= goal.targetAmount) return today;
  const start = input.startDate ?? today;
  const i = monthlyRate(input.annualReturnPct);
  let balance = goal.currentAmount;
  let month = start.slice(0, 7);
  const day = Number(start.slice(8, 10));
  let oneTimePending = input.oneTime ? { ...input.oneTime } : null;
  if (oneTimePending && oneTimePending.date <= today) {
    balance += oneTimePending.amount;
    oneTimePending = null;
    if (balance >= goal.targetAmount) return today;
  }
  for (let k = 0; k < MAX_PROJECTION_MONTHS; k++) {
    const dim = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    const date = `${month}-${String(Math.min(day, dim)).padStart(2, "0")}`;
    if (k > 0) balance *= 1 + i;
    if (oneTimePending && oneTimePending.date <= date) {
      balance += oneTimePending.amount;
      oneTimePending = null;
    }
    balance += Math.max(0, monthly);
    if (balance + 1e-6 >= goal.targetAmount) return date;
    if (monthly <= 0 && !oneTimePending && i === 0) return null;
    month = shiftMonthKey(month, 1);
  }
  return null;
}

/** Extra per month needed to finish `monthsEarlier` months before the target date. */
export function extraToFinishEarlier(goal: GoalSnapshot, input: GoalPlanInput, today: string, monthsEarlier: number, currentMonthly: number): number | null {
  if (!goal.targetDate) return null;
  const earlier = shiftMonthKey(goal.targetDate.slice(0, 7), -monthsEarlier) + goal.targetDate.slice(7);
  const target = requiredMonthly({ ...goal, targetDate: earlier }, input, today).amount;
  return target === null ? null : roundMoney(Math.max(0, target - currentMonthly));
}

/**
 * Target-date analysis for one goal at a given monthly amount (the user's
 * current contribution by default). 217 calls this with scenario allocations.
 */
export function analyzeGoal(goal: GoalSnapshot, input: GoalPlanInput, today: string, allocatedMonthly?: number): GoalFundingResult {
  const remaining = remainingAmount(goal, input);
  const currentMonthly = typeof input.currentContribution === "number" ? roundMoney(input.currentContribution) : null;
  const base = { goalId: goal.goalId, name: goal.name, remaining, currentMonthly };
  const reasons: string[] = [];

  if (input.excluded) {
    return { ...base, monthsToTarget: null, requiredMonthly: null, allocatedMonthly: 0, gapMonthly: null, projectedCompletion: null, monthsAheadOfTarget: null, changeVsCurrent: null, status: "excluded", reasons: ["Left out of this plan."] };
  }

  const allocated = roundMoney(allocatedMonthly ?? currentMonthly ?? 0);
  const changeVsCurrent = currentMonthly === null ? null : roundMoney(allocated - currentMonthly);

  if (goal.currentAmount >= goal.targetAmount) {
    return { ...base, remaining: 0, monthsToTarget: goal.targetDate ? Math.max(0, monthsBetween(today, goal.targetDate)) : null, requiredMonthly: 0, allocatedMonthly: allocated, gapMonthly: allocated, projectedCompletion: today, monthsAheadOfTarget: null, changeVsCurrent, status: "funded", reasons: ["Already fully funded."] };
  }

  const req = requiredMonthly(goal, input, today);
  const projected = projectCompletion(goal, input, allocated, today);
  const monthsToTarget = goal.targetDate ? Math.max(0, monthsBetween(today, goal.targetDate)) : null;
  const gapMonthly = req.amount === null ? null : roundMoney(allocated - req.amount);
  // Whole months ahead (+) or behind (−); finishing even a few days late counts as one month behind.
  let monthsAhead: number | null = null;
  if (projected && goal.targetDate) {
    const m = monthsBetween(projected, goal.targetDate);
    monthsAhead = m === 0 && daysBetweenDateKeys(projected, goal.targetDate) < 0 ? -1 : m;
  }

  let status: GoalFundingResult["status"];
  if (!goal.targetDate) {
    status = "no_target_date";
    reasons.push("No target date, so there's no required monthly amount.");
  } else if (goal.targetDate < today) {
    status = "target_date_passed";
    reasons.push("The target date has passed; the full remaining amount is still needed.");
  } else if (projected === null) {
    status = "not_fundable";
    reasons.push(allocated > 0 ? "At this amount the goal isn't reached within 50 years." : "Nothing is allocated, so the goal isn't reached.");
  } else if (projected > goal.targetDate) {
    status = "behind";
    reasons.push(`Short by ${Math.abs(gapMonthly ?? 0)} a month to finish by the target date.`);
  } else if (gapMonthly !== null && gapMonthly > 0 && monthsAhead !== null && monthsAhead > 0) {
    status = "ahead";
    reasons.push("Finishes before the target date at this amount.");
  } else {
    status = "on_track";
    reasons.push("Finishes by the target date at this amount.");
  }
  if (input.annualReturnPct) reasons.push(`Assumes ${input.annualReturnPct}% yearly growth — an assumption, not a guarantee.`);
  if (input.oneTime) reasons.push(`Includes a one-time ${input.oneTime.amount} on ${input.oneTime.date}.`);

  return { ...base, monthsToTarget, requiredMonthly: req.amount, allocatedMonthly: allocated, gapMonthly, projectedCompletion: projected, monthsAheadOfTarget: monthsAhead, changeVsCurrent, status, reasons };
}
