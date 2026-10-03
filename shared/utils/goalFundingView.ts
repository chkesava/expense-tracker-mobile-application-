/**
 * View model for the Goal Funding Optimizer screen (SPENDLY-218). Pure:
 * labels, explanations and screen-reader text so meaning never depends on
 * colour, and the "current plan vs scenario" comparison is always in words.
 */

import type { GoalFundingMode, GoalFundingResult, GoalFundingResultSet, GoalFundingStatus } from "../types/goalFunding";
import type { AdjustedCapacity } from "./goalFundingInputs";
import { GOAL_FUNDING_ASSUMPTIONS } from "./goalFundingModel";

export const GOAL_FUNDING_MODE_INFO: Record<GoalFundingMode, { label: string; explanation: string }> = {
  target_date: { label: "By target date", explanation: "Each goal gets what it needs to finish on time. If there isn't enough, every goal is scaled down by the same share." },
  fixed_budget: { label: "Fixed budget", explanation: "After any minimums, your monthly amount is shared in proportion to what each goal still needs." },
  priority: { label: "My priority order", explanation: "After any minimums, goals are funded in the order you set. Goals without a priority share what's left evenly." },
  balanced: { label: "Balanced", explanation: "After any minimums, every goal is brought up to the same share of what it needs, so the biggest gaps close first." },
};

export const GOAL_FUNDING_STATUS_LABELS: Record<GoalFundingStatus, string> = {
  on_track: "On track",
  behind: "Behind target",
  ahead: "Ahead of target",
  funded: "Fully funded",
  no_target_date: "No target date",
  target_date_passed: "Target date passed",
  not_fundable: "Not reached",
  excluded: "Left out",
};

export function capacitySourceLabel(c: AdjustedCapacity): string {
  if (c.monthly === null) return "Unknown";
  if (c.hypothetical) return "What-if";
  return c.usesPlannedOverride ? "Your amount" : "From your records";
}

export function monthsPhrase(n: number | null): string {
  if (n === null) return "";
  if (n === 0) return "on the target date";
  const abs = Math.abs(n);
  return `${abs} month${abs === 1 ? "" : "s"} ${n > 0 ? "ahead" : "behind"}`;
}

/** "Current plan → Scenario" in words for one goal. */
export function comparisonText(r: GoalFundingResult, format: (n: number) => string): string {
  const current = r.currentMonthly === null ? "Current plan: not entered" : `Current plan: ${format(r.currentMonthly)} a month`;
  const scenario = `Scenario: ${format(r.allocatedMonthly)} a month`;
  const change =
    r.changeVsCurrent === null || r.changeVsCurrent === 0
      ? ""
      : ` (${r.changeVsCurrent > 0 ? "up" : "down"} ${format(Math.abs(r.changeVsCurrent))})`;
  return `${current} · ${scenario}${change}`;
}

export function goalRowAccessibilityLabel(r: GoalFundingResult, format: (n: number) => string): string {
  const parts = [r.name, GOAL_FUNDING_STATUS_LABELS[r.status], comparisonText(r, format)];
  if (r.requiredMonthly !== null) parts.push(`needs ${format(r.requiredMonthly)} a month`);
  if (r.projectedCompletion) parts.push(`finishes ${r.projectedCompletion}${r.monthsAheadOfTarget !== null ? `, ${monthsPhrase(r.monthsAheadOfTarget)}` : ""}`);
  return parts.join(". ");
}

/** "Why" lines for one goal: the reasons plus the mode's rule. */
export function whyLines(r: GoalFundingResult, mode: GoalFundingMode, format: (n: number) => string): string[] {
  const lines = [...r.reasons];
  lines.push(`Mode: ${GOAL_FUNDING_MODE_INFO[mode].label}. ${GOAL_FUNDING_MODE_INFO[mode].explanation}`);
  if (r.requiredMonthly !== null) lines.push(`To finish on time it needs ${format(r.requiredMonthly)} a month; ${format(r.remaining)} is still to save.`);
  if (r.gapMonthly !== null && r.gapMonthly < 0) lines.push(`This scenario is ${format(Math.abs(r.gapMonthly))} a month short of that.`);
  return lines;
}

/** Trade-offs in words, using goal names. */
export function tradeOffLines(set: GoalFundingResultSet, format: (n: number) => string): string[] {
  const name = new Map(set.goals.map((g) => [g.goalId, g.name]));
  return set.tradeOffs.map(
    (t) => `${name.get(t.goalId)} gets more than today; ${t.affects.map((a) => `${name.get(a.goalId)} gets ${format(a.monthly)} less`).join(", ")}.`
  );
}

export function assumptionLines(set: GoalFundingResultSet): string[] {
  return [
    ...set.assumptions.map((a) => GOAL_FUNDING_ASSUMPTIONS[a]),
    "This is a plan to compare, not an instruction. Nothing here changes your goals or moves money.",
  ];
}
