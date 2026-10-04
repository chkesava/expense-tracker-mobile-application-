import { describe, expect, it } from "vitest";

import type { GoalSnapshot } from "../types/goalFunding";
import { runGoalFundingScenario } from "./goalFundingOptimizer";
import { duplicatePlanDoc, goalFundingPlanDoc, goalsChangedSince, sortPlans, validatePlanName, type GoalFundingPlan } from "./goalFundingPlans";

const goals: GoalSnapshot[] = [
  { goalId: "trip", name: "Trip", targetAmount: 120000, currentAmount: 0, targetDate: "2027-09-15" },
  { goalId: "car", name: "Car", targetAmount: 240000, currentAmount: 0 },
];
const doc = () =>
  goalFundingPlanDoc({
    name: "  Main plan ",
    mode: "priority",
    plannedMonthly: 21000.456,
    allowOverAllocation: false,
    inputs: [
      { goalId: "trip", priority: 1, currentContribution: 5000, minContribution: undefined },
      { goalId: "car" },
      { goalId: "deleted", priority: 2 },
    ],
    goals,
    nowMs: 10,
  });

describe("plan document", () => {
  it("stores only planning data, without undefined or ledger fields", () => {
    const d = doc();
    expect(d).toEqual({
      name: "Main plan",
      mode: "priority",
      plannedMonthly: 21000.46,
      allowOverAllocation: false,
      inputs: [{ goalId: "trip", priority: 1, currentContribution: 5000 }],
      goalSnapshot: [
        { goalId: "trip", name: "Trip", targetAmount: 120000, currentAmount: 0, targetDate: "2027-09-15" },
        { goalId: "car", name: "Car", targetAmount: 240000, currentAmount: 0 },
      ],
      engineVersion: 1,
      archived: false,
      createdAtMs: 10,
      updatedAtMs: 10,
    });
    expect(JSON.stringify(d)).not.toContain("undefined");
    for (const f of ["amount", "date", "accountId"]) expect(Object.keys(d)).not.toContain(f);
  });

  it("keeps the creation time and archive state when updating", () => {
    const updated = goalFundingPlanDoc({ ...doc(), name: "Main", plannedMonthly: null, goals, nowMs: 99, existing: { createdAtMs: 10, archived: true } });
    expect(updated).toMatchObject({ createdAtMs: 10, updatedAtMs: 99, archived: true });
    expect(updated).not.toHaveProperty("plannedMonthly");
  });

  it("validates names", () => {
    expect(validatePlanName(" ")).toBe("Give the plan a name.");
    expect(validatePlanName("x".repeat(81))).toMatch(/under 80/);
    expect(validatePlanName("Ok")).toBeNull();
  });
});

describe("duplicate", () => {
  it("creates an independent copy", () => {
    const a = doc();
    const b = duplicatePlanDoc(a, "Copy of Main plan", 50);
    b.inputs[0].priority = 9;
    expect(a.inputs[0].priority).toBe(1);
    expect(b).toMatchObject({ name: "Copy of Main plan", createdAtMs: 50, archived: false });
  });
});

describe("reproducibility and goal changes", () => {
  it("reopening a plan gives the same result for the same goals", () => {
    const d = doc();
    const run = () =>
      runGoalFundingScenario({ goals: d.goalSnapshot, today: "2026-10-15", scenario: { mode: d.mode, monthlyPool: d.plannedMonthly ?? null, allowOverAllocation: d.allowOverAllocation, inputs: d.inputs } });
    expect(run()).toEqual(run());
  });

  it("lists what changed in the goals since the plan was saved", () => {
    const now: GoalSnapshot[] = [
      { goalId: "trip", name: "Holiday", targetAmount: 150000, currentAmount: 10000, targetDate: "2027-12-15" },
      { goalId: "bike", name: "Bike", targetAmount: 80000, currentAmount: 0 },
    ];
    expect(goalsChangedSince(doc().goalSnapshot, now)).toEqual([
      { goalId: "bike", name: "Bike", kinds: ["added"] },
      { goalId: "car", name: "Car", kinds: ["removed"] },
      { goalId: "trip", name: "Holiday", kinds: ["target_changed", "saved_changed", "date_changed", "renamed"] },
    ]);
    expect(goalsChangedSince(goals, goals)).toEqual([]);
  });

  it("sorts active plans first, newest first", () => {
    const p = (id: string, archived: boolean, updatedAtMs: number) => ({ ...doc(), id, archived, updatedAtMs }) as GoalFundingPlan;
    expect(sortPlans([p("a", true, 9), p("b", false, 1), p("c", false, 5)]).map((x) => x.id)).toEqual(["c", "b", "a"]);
  });
});
