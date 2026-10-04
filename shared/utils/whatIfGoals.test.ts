import { describe, expect, it } from "vitest";
import { runWhatIfSavingsGoalScenario, savingsPlanAdjustment, type WhatIfInvestmentPlan } from "./whatIfGoals";
import type { GoalFundingScenario, GoalSnapshot } from "../types/goalFunding";

const provenance = { kind: "user" as const, source: "what-if-test", asOfDate: "2026-10-04" };
const goals: GoalSnapshot[] = [{ goalId: "home", name: "Home", targetAmount: 120_000, currentAmount: 20_000, targetDate: "2027-10-04" }];
const scenario: GoalFundingScenario = { mode: "target_date", monthlyPool: 12_000, allowOverAllocation: false, inputs: [{ goalId: "home", currentContribution: 8_000 }] };

describe("what-if savings and goals", () => {
  it("delegates goal calculations and applies target-date overrides without mutating inputs", () => {
    const original = JSON.stringify(goals);
    const output = runWhatIfSavingsGoalScenario({ today: "2026-10-04", projectionMonths: 12, goals, goalScenario: scenario, goalOverrides: [{ goalId: "home", targetDate: "2027-04-04" }] });
    expect(output.issues).toEqual([]);
    expect(output.goalFunding?.goals[0].requiredMonthly).toBeGreaterThan(0);
    expect(output.goalFunding?.goals[0].monthsToTarget).toBeLessThan(12);
    expect(JSON.stringify(goals)).toBe(original);
  });

  it("uses shared schedule semantics for monthly savings and emits a generic adjustment", () => {
    const plan = { id: "save", label: "Extra savings", amount: 1_000, frequency: "monthly" as const, firstDate: "2026-10-31", provenance };
    const empty = runWhatIfSavingsGoalScenario({ today: "2026-10-04", projectionMonths: 3, goals });
    expect(empty.savings).toEqual([]);
    const projected = runWhatIfSavingsGoalScenario({ today: "2026-10-04", projectionMonths: 3, goals, savings: [plan] });
    expect(projected.savings[0].events.map((e) => e.date)).toEqual(["2026-10-31", "2026-11-30", "2026-12-31"]);
    expect(savingsPlanAdjustment(plan).burnClass).toBe("savings_contribution");
  });

  it("projects one-time and recurring investments with explicit return assumptions", () => {
    const plans: WhatIfInvestmentPlan[] = [
      { id: "lump", label: "One-time fund", amount: 10_000, frequency: "once", firstDate: "2026-10-04", annualReturnPct: 12, provenance },
      { id: "sip", label: "Monthly fund", amount: 2_000, frequency: "monthly", firstDate: "2026-10-10", annualReturnPct: 0, provenance },
    ];
    const output = runWhatIfSavingsGoalScenario({ today: "2026-10-04", projectionMonths: 3, goals, investments: plans });
    expect(output.issues).toEqual([]);
    expect(output.investments[0].projectedValue).toBeGreaterThan(10_000);
    expect(output.investments[1].totalContributed).toBe(6_000);
    expect(output.assumptions.map((a) => a.code)).toContain("investment_return_assumed");
  });

  it("rejects invalid return assumptions", () => {
    const output = runWhatIfSavingsGoalScenario({ today: "2026-10-04", projectionMonths: 12, goals, investments: [{ id: "bad", label: "Bad", amount: 1, frequency: "monthly", firstDate: "2026-10-04", annualReturnPct: 101, provenance }] });
    expect(output.issues).toContain("investments[0].annualReturnPct must be between 0 and 100");
  });
});
