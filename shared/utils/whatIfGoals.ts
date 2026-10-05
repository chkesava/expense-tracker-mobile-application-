/**
 * Savings, goal and investment What-If projections (SPENDLY-200).
 *
 * This module is a planning adapter. It delegates goal maths to the existing
 * Goal Funding contracts and returns derived projections. It never writes
 * goals, savings, investments or SIP records.
 */

import type { GoalFundingResultSet, GoalFundingScenario, GoalSnapshot } from "../types/goalFunding";
import type { Investment } from "../types/investment";
import type { WhatIfAdjustment, WhatIfAssumption, WhatIfProvenance } from "../types/whatIf";
import { daysBetweenDateKeys, daysInMonth, isValidDateKey, shiftMonthKey } from "./dates";
import { getInvestmentValuation } from "./investmentInterest";
import { roundMoney } from "./money";
import { occurrencesBetween, type RunwaySchedule } from "./runwayEngine";
import { runGoalFundingScenario } from "./goalFundingOptimizer";

export type WhatIfContributionFrequency = "once" | "weekly" | "monthly";

export interface WhatIfSavingsPlan {
  id: string;
  label: string;
  amount: number;
  frequency: WhatIfContributionFrequency;
  firstDate: string;
  untilDate?: string;
  provenance: WhatIfProvenance;
}

export interface WhatIfInvestmentPlan extends WhatIfSavingsPlan {
  /** Effective annual return assumption; not a promise or forecast. */
  annualReturnPct: number;
}

export interface WhatIfGoalOverride {
  goalId: string;
  targetAmount?: number;
  targetDate?: string;
}

export interface WhatIfSavingsGoalInput {
  today: string;
  projectionMonths: number;
  goals: readonly GoalSnapshot[];
  goalScenario?: GoalFundingScenario;
  goalOverrides?: readonly WhatIfGoalOverride[];
  savings?: readonly WhatIfSavingsPlan[];
  investments?: readonly WhatIfInvestmentPlan[];
  canonicalInvestments?: readonly Investment[];
}

export interface WhatIfContributionEvent {
  date: string;
  amount: number;
}

export interface WhatIfSavingsProjection {
  id: string;
  label: string;
  totalContributed: number;
  events: WhatIfContributionEvent[];
}

export interface WhatIfInvestmentEvent extends WhatIfContributionEvent {
  valueAfter: number;
}

export interface WhatIfInvestmentProjection extends WhatIfSavingsProjection {
  annualReturnPct: number;
  startingValue: number;
  projectedValue: number;
  estimatedGrowth: number;
  events: WhatIfInvestmentEvent[];
}

export interface WhatIfSavingsGoalOutput {
  goalFunding: GoalFundingResultSet | null;
  savings: WhatIfSavingsProjection[];
  investments: WhatIfInvestmentProjection[];
  assumptions: WhatIfAssumption[];
  issues: string[];
  horizonEnd: string;
}

const MAX_PLANS = 50;
const MAX_RETURN_PCT = 100;

function horizonEnd(today: string, months: number): string {
  // Match the runway contract: projectionMonths counts the current month.
  const month = shiftMonthKey(today.slice(0, 7), months - 1);
  return `${month}-${String(daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)))).padStart(2, "0")}`;
}

function scheduleFor(plan: WhatIfSavingsPlan, end: string): RunwaySchedule {
  if (plan.frequency === "once") return { kind: "once", date: plan.firstDate };
  if (plan.frequency === "weekly") return { kind: "every_n_days", firstDate: plan.firstDate, intervalDays: 7, untilDate: plan.untilDate ?? end };
  return { kind: "monthly", firstDate: plan.firstDate, dayOfMonth: Number(plan.firstDate.slice(8, 10)), untilMonth: (plan.untilDate ?? end).slice(0, 7) };
}

function datesFor(plan: WhatIfSavingsPlan, today: string, end: string): string[] {
  return occurrencesBetween(scheduleFor(plan, end), today, end).filter((date) => !plan.untilDate || date <= plan.untilDate);
}

function validatePlan(plan: WhatIfSavingsPlan, index: number, kind: string): string[] {
  const field = `${kind}[${index}]`;
  const issues: string[] = [];
  if (!plan.id.trim()) issues.push(`${field}.id is required`);
  if (!plan.label.trim()) issues.push(`${field}.label is required`);
  if (!Number.isFinite(plan.amount) || plan.amount < 0) issues.push(`${field}.amount must be zero or more`);
  if (!isValidDateKey(plan.firstDate)) issues.push(`${field}.firstDate must be a valid date`);
  if (plan.untilDate && !isValidDateKey(plan.untilDate)) issues.push(`${field}.untilDate must be a valid date`);
  if (plan.untilDate && plan.untilDate < plan.firstDate) issues.push(`${field}.untilDate must not precede firstDate`);
  if (!["once", "weekly", "monthly"].includes(plan.frequency)) issues.push(`${field}.frequency is invalid`);
  return issues;
}

function assumptionsFor(plan: WhatIfSavingsPlan, type: string): WhatIfAssumption {
  return {
    code: `${type}_hypothetical`,
    label: `${type === "investment" ? "Investment" : "Savings"} contribution is hypothetical`,
    value: plan.amount,
    provenance: plan.provenance,
  };
}

function cloneGoals(goals: readonly GoalSnapshot[], overrides: readonly WhatIfGoalOverride[]): GoalSnapshot[] {
  const byId = new Map(overrides.map((override) => [override.goalId, override]));
  return goals.map((goal) => {
    const override = byId.get(goal.goalId);
    if (!override) return { ...goal };
    return {
      ...goal,
      ...(override.targetAmount === undefined ? {} : { targetAmount: roundMoney(Math.max(0, override.targetAmount)) }),
      ...(override.targetDate === undefined ? {} : { targetDate: override.targetDate }),
    };
  });
}

function savingsProjection(plan: WhatIfSavingsPlan, today: string, end: string): WhatIfSavingsProjection {
  const events = datesFor(plan, today, end).map((date) => ({ date, amount: roundMoney(plan.amount) }));
  return { id: plan.id, label: plan.label, totalContributed: roundMoney(events.reduce((sum, event) => sum + event.amount, 0)), events };
}

function investmentProjection(plan: WhatIfInvestmentPlan, today: string, end: string, startingValue: number): WhatIfInvestmentProjection {
  const dates = datesFor(plan, today, end);
  let value = Math.max(0, startingValue);
  let previous = today;
  const events: WhatIfInvestmentEvent[] = [];
  for (const date of dates) {
    value *= Math.pow(1 + plan.annualReturnPct / 100, daysBetweenDateKeys(previous, date) / 365);
    value += Math.max(0, plan.amount);
    value = roundMoney(value);
    events.push({ date, amount: roundMoney(plan.amount), valueAfter: value });
    previous = date;
  }
  value = roundMoney(value * Math.pow(1 + plan.annualReturnPct / 100, daysBetweenDateKeys(previous, end) / 365));
  const contributed = roundMoney(events.reduce((sum, event) => sum + event.amount, 0));
  const base = Math.max(0, startingValue);
  return {
    id: plan.id,
    label: plan.label,
    totalContributed: contributed,
    events,
    annualReturnPct: plan.annualReturnPct,
    startingValue: roundMoney(startingValue),
    projectedValue: value,
    estimatedGrowth: roundMoney(value - base - events.reduce((sum, event) => sum + event.amount, 0)),
  };
}

/** Build a savings/goal/investment What-If projection without changing inputs. */
export function runWhatIfSavingsGoalScenario(input: WhatIfSavingsGoalInput): WhatIfSavingsGoalOutput {
  const issues: string[] = [];
  if (!isValidDateKey(input.today)) issues.push("today must be a valid date");
  if (!Number.isInteger(input.projectionMonths) || input.projectionMonths < 1 || input.projectionMonths > 24) issues.push("projectionMonths must be a whole number from 1 to 24");
  if (input.goals.length > MAX_PLANS) issues.push(`goals must contain at most ${MAX_PLANS} items`);
  const end = horizonEnd(input.today, Math.max(1, input.projectionMonths));
  const savings = [...(input.savings ?? [])];
  const investments = [...(input.investments ?? [])];
  savings.forEach((plan, index) => issues.push(...validatePlan(plan, index, "savings")));
  investments.forEach((plan, index) => {
    issues.push(...validatePlan(plan, index, "investments"));
    if (!Number.isFinite(plan.annualReturnPct) || plan.annualReturnPct < 0 || plan.annualReturnPct > MAX_RETURN_PCT) issues.push(`investments[${index}].annualReturnPct must be between 0 and ${MAX_RETURN_PCT}`);
  });
  const assumptions = [...savings.map((plan) => assumptionsFor(plan, "savings")), ...investments.map((plan) => assumptionsFor(plan, "investment"))];
  investments.forEach((plan) => assumptions.push({ code: "investment_return_assumed", label: "Investment return is a user assumption, not a guarantee", value: plan.annualReturnPct, provenance: plan.provenance }));
  if (investments.length) assumptions.push({ code: "investment_uncertainty_excluded", label: "Taxes, fees and market uncertainty are not modelled", value: true, provenance: investments[0].provenance });
  const goalFunding = input.goalScenario ? runGoalFundingScenario({ goals: cloneGoals(input.goals, input.goalOverrides ?? []), scenario: input.goalScenario, today: input.today }) : null;
  const canonicalValue = input.canonicalInvestments?.reduce((sum, investment) => sum + getInvestmentValuation(investment, input.today).totalValue, 0) ?? 0;
  return { goalFunding, savings: savings.map((plan) => savingsProjection(plan, input.today, end)), investments: investments.map((plan) => investmentProjection(plan, input.today, end, canonicalValue)), assumptions, issues, horizonEnd: end };
}

/** Convert a savings plan to the generic What-If adjustment contract. */
export function savingsPlanAdjustment(plan: WhatIfSavingsPlan): WhatIfAdjustment {
  const schedule: RunwaySchedule = plan.frequency === "once"
    ? { kind: "once", date: plan.firstDate }
    : plan.frequency === "weekly"
      ? { kind: "every_n_days", firstDate: plan.firstDate, intervalDays: 7, ...(plan.untilDate ? { untilDate: plan.untilDate } : {}) }
      : { kind: "monthly", firstDate: plan.firstDate, dayOfMonth: Number(plan.firstDate.slice(8, 10)), ...(plan.untilDate ? { untilMonth: plan.untilDate.slice(0, 7) } : {}) };
  return { id: plan.id, label: plan.label, kind: "savings", operation: "add", direction: "out", amount: roundMoney(plan.amount), schedule, burnClass: "savings_contribution", provenance: plan.provenance };
}
