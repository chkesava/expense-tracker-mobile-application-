import { describe, expect, it } from "vitest";

import { GOAL_FUNDING_MODES, type GoalSnapshot } from "../types/goalFunding";
import { applyCapacityAdjustments } from "./goalFundingInputs";
import { buildFundingCapacity } from "./goalFundingCapacity";
import { runGoalFundingScenario } from "./goalFundingOptimizer";
import {
  GOAL_FUNDING_MODE_INFO,
  assumptionLines,
  capacitySourceLabel,
  comparisonText,
  goalRowAccessibilityLabel,
  monthsPhrase,
  tradeOffLines,
  whyLines,
} from "./goalFundingView";

const fmt = (n: number) => `₹${n}`;
const goals: GoalSnapshot[] = [
  { goalId: "trip", name: "Trip", targetAmount: 120000, currentAmount: 0, targetDate: "2027-09-15" },
  { goalId: "car", name: "Car", targetAmount: 240000, currentAmount: 0, targetDate: "2027-09-15" },
];
const set = runGoalFundingScenario({
  goals,
  today: "2026-10-15",
  scenario: { mode: "priority", monthlyPool: 21000, allowOverAllocation: false, inputs: [{ goalId: "trip", priority: 1, currentContribution: 5000 }, { goalId: "car", priority: 2, currentContribution: 16000 }] },
});
const trip = set.goals.find((g) => g.goalId === "trip")!;
const car = set.goals.find((g) => g.goalId === "car")!;

describe("goal funding view", () => {
  it("explains every mode", () => {
    for (const m of GOAL_FUNDING_MODES) expect(GOAL_FUNDING_MODE_INFO[m].explanation.length).toBeGreaterThan(30);
  });

  it("compares current plan and scenario in words", () => {
    expect(comparisonText(trip, fmt)).toBe("Current plan: ₹5000 a month · Scenario: ₹10000 a month (up ₹5000)");
    expect(comparisonText({ ...trip, currentMonthly: null, changeVsCurrent: null }, fmt)).toBe("Current plan: not entered · Scenario: ₹10000 a month");
  });

  it("builds a full screen-reader sentence with status and timing", () => {
    expect(goalRowAccessibilityLabel(car, fmt)).toMatch(/^Car\. Behind target\. Current plan: ₹16000 a month · Scenario: ₹11000 a month \(down ₹5000\)\. needs ₹20000 a month\. finishes .*months behind$/);
  });

  it("says why, including the mode rule and the shortfall", () => {
    const lines = whyLines(car, "priority", fmt);
    expect(lines.some((l) => l.startsWith("Mode: My priority order."))).toBe(true);
    expect(lines.some((l) => l.includes("₹9000 a month short"))).toBe(true);
  });

  it("states trade-offs and assumptions in plain words", () => {
    expect(tradeOffLines(set, fmt)).toEqual(["Trip gets more than today; Car gets ₹5000 less."]);
    expect(assumptionLines(set).at(-1)).toMatch(/Nothing here changes your goals or moves money/);
  });

  it("labels where the monthly amount comes from", () => {
    const window = { from: "2026-10-15", to: "2027-01-14" };
    const real = buildFundingCapacity({ baseline: { monthlyEarnedIncome: 1, monthlyOutflowByClass: {} }, events: [], window });
    expect(capacitySourceLabel(applyCapacityAdjustments(real, []))).toBe("From your records");
    expect(capacitySourceLabel(applyCapacityAdjustments(buildFundingCapacity({ baseline: null, events: [], window, plannedMonthly: 5 }), []))).toBe("Your amount");
    expect(capacitySourceLabel(applyCapacityAdjustments(real, [{ id: "x", label: "x", monthlyDelta: 5, source: "user" }]))).toBe("What-if");
    expect(capacitySourceLabel(applyCapacityAdjustments(buildFundingCapacity({ baseline: null, events: [], window }), []))).toBe("Unknown");
  });

  it("phrases months ahead and behind", () => {
    expect(monthsPhrase(2)).toBe("2 months ahead");
    expect(monthsPhrase(-1)).toBe("1 month behind");
    expect(monthsPhrase(0)).toBe("on the target date");
  });
});
