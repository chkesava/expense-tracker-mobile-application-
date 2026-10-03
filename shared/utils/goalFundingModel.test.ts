import { describe, expect, it } from "vitest";

import type { FinancialGoal } from "../types/expense";
import { GOAL_FUNDING_MODES, type GoalFundingScenario } from "../types/goalFunding";
import { GOAL_FUNDING_ASSUMPTIONS, inputsForGoals, snapshotGoals, validateGoalPlanInput, validateScenario } from "./goalFundingModel";

const goals: FinancialGoal[] = [
  { id: "trip", name: "Trip", targetAmount: 100000, currentAmount: 30000, deadline: "2027-06-30" },
  { id: "car", name: "Car", targetAmount: 500000.456, currentAmount: -5, deadline: "not-a-date" },
];

describe("snapshot", () => {
  it("copies goal values without changing the goals", () => {
    const before = JSON.stringify(goals);
    const s = snapshotGoals(goals);
    expect(JSON.stringify(goals)).toBe(before);
    expect(s).toEqual([
      { goalId: "car", name: "Car", targetAmount: 500000.46, currentAmount: 0, targetDate: undefined },
      { goalId: "trip", name: "Trip", targetAmount: 100000, currentAmount: 30000, targetDate: "2027-06-30" },
    ]);
  });
});

describe("validation", () => {
  it("accepts blanks — unknown is allowed — and explains bad values", () => {
    expect(validateGoalPlanInput({ goalId: "trip" })).toEqual([]);
    expect(
      validateGoalPlanInput({ goalId: "trip", priority: 0, minContribution: -1, currentContribution: Number.NaN, oneTime: { amount: 5, date: "soon" }, annualReturnPct: 50, startDate: "x" })
    ).toHaveLength(6);
  });

  it("rejects duplicate goals and duplicate priorities, never inventing an order", () => {
    const s: GoalFundingScenario = { mode: "priority", monthlyPool: 10000, allowOverAllocation: false, inputs: [{ goalId: "a", priority: 1 }, { goalId: "a", priority: 1 }] };
    expect(validateScenario(s)).toEqual(["Each goal can appear only once.", "Each priority number can be used once."]);
    expect(validateScenario({ ...s, inputs: [{ goalId: "a" }, { goalId: "b" }] })).toEqual([]);
    expect(validateScenario({ ...s, mode: "x" as never, monthlyPool: -1 })).toContain("Unknown mode.");
  });
});

describe("inputs", () => {
  it("keeps the user's entries and adds blanks for new goals", () => {
    const s = snapshotGoals(goals);
    expect(inputsForGoals(s, [{ goalId: "trip", priority: 1 }, { goalId: "gone", priority: 2 }])).toEqual([{ goalId: "car" }, { goalId: "trip", priority: 1 }]);
  });
});

describe("contract", () => {
  it("documents four planning modes and every assumption in words", () => {
    expect(GOAL_FUNDING_MODES).toEqual(["target_date", "fixed_budget", "priority", "balanced"]);
    for (const text of Object.values(GOAL_FUNDING_ASSUMPTIONS)) expect(text.length).toBeGreaterThan(20);
    expect(GOAL_FUNDING_ASSUMPTIONS.growth_assumed).toMatch(/not a guarantee/);
  });
});
