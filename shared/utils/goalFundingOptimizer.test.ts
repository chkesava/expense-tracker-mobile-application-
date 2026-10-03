import { describe, expect, it } from "vitest";

import type { GoalFundingScenario, GoalSnapshot } from "../types/goalFunding";
import { runGoalFundingScenario } from "./goalFundingOptimizer";

const TODAY = "2026-10-15";
// Requirements at 12 contributions: trip 10,000, car 20,000, fund 5,000 a month.
const goals: GoalSnapshot[] = [
  { goalId: "trip", name: "Trip", targetAmount: 120000, currentAmount: 0, targetDate: "2027-09-15" },
  { goalId: "car", name: "Car", targetAmount: 240000, currentAmount: 0, targetDate: "2027-09-15" },
  { goalId: "fund", name: "Emergency fund", targetAmount: 60000, currentAmount: 0, targetDate: "2027-09-15" },
];
const run = (over: Partial<GoalFundingScenario>, g: GoalSnapshot[] = goals) =>
  runGoalFundingScenario({ goals: g, today: TODAY, scenario: { mode: "balanced", monthlyPool: 21000, allowOverAllocation: false, inputs: [], ...over } });
const alloc = (r: ReturnType<typeof run>) => Object.fromEntries(r.goals.map((g) => [g.goalId, g.allocatedMonthly]));

describe("target-date mode", () => {
  it("allocates each requirement when the pool covers it", () => {
    const r = run({ mode: "target_date", monthlyPool: 40000 });
    expect(alloc(r)).toEqual({ car: 20000, fund: 5000, trip: 10000 });
    expect(r).toMatchObject({ totalRequired: 35000, totalAllocated: 35000, unallocated: 5000 });
  });

  it("scales down evenly instead of exceeding the pool, unless over-allocation is allowed", () => {
    expect(alloc(run({ mode: "target_date", monthlyPool: 17500 }))).toEqual({ car: 10000, fund: 2500, trip: 5000 });
    const over = run({ mode: "target_date", monthlyPool: 17500, allowOverAllocation: true });
    expect(over.totalAllocated).toBe(35000);
    expect(over.unallocated).toBe(-17500);
    expect(over.assumptions).toContain("over_allocation_hypothetical");
  });
});

describe("fixed-budget mode", () => {
  it("spreads the pool in proportion to need, after minimums", () => {
    expect(alloc(run({ mode: "fixed_budget", monthlyPool: 17500 }))).toEqual({ car: 10000, fund: 2500, trip: 5000 });
    const withMin = run({ mode: "fixed_budget", monthlyPool: 17500, inputs: [{ goalId: "fund", minContribution: 5000 }] });
    expect(alloc(withMin).fund).toBe(5000);
    expect(withMin.totalAllocated).toBeLessThanOrEqual(17500);
  });

  it("never gives a goal more than it needs; the rest stays unallocated", () => {
    const r = run({ mode: "fixed_budget", monthlyPool: 50000 });
    expect(alloc(r)).toEqual({ car: 20000, fund: 5000, trip: 10000 });
    expect(r.unallocated).toBe(15000);
  });
});

describe("priority mode", () => {
  it("fills goals in the user's order", () => {
    const r = run({ mode: "priority", monthlyPool: 21000, inputs: [{ goalId: "fund", priority: 1 }, { goalId: "trip", priority: 2 }, { goalId: "car", priority: 3 }] });
    expect(alloc(r)).toEqual({ fund: 5000, trip: 10000, car: 6000 });
  });

  it("never invents an order: unranked goals share what's left evenly", () => {
    const r = run({ mode: "priority", monthlyPool: 21000, inputs: [{ goalId: "trip", priority: 1 }] });
    expect(alloc(r).trip).toBe(10000);
    // car and fund get the same share of their requirement: 11,000 over 25,000 → 44%.
    expect(alloc(r).car).toBe(8800);
    expect(alloc(r).fund).toBe(2200);
    expect(run({ mode: "priority", inputs: [] }).assumptions).toContain("no_priority_given");
  });
});

describe("balanced mode", () => {
  it("gives every goal the same share of its requirement", () => {
    const r = run({ mode: "balanced", monthlyPool: 21000 });
    // 21,000 / 35,000 = 60% of each requirement.
    expect(alloc(r)).toEqual({ car: 12000, fund: 3000, trip: 6000 });
  });

  it("respects minimums first", () => {
    const r = run({ mode: "balanced", monthlyPool: 21000, inputs: [{ goalId: "fund", minContribution: 5000 }] });
    expect(alloc(r).fund).toBe(5000);
    expect(r.totalAllocated).toBeLessThanOrEqual(21000);
  });
});

describe("shared guarantees", () => {
  it("is deterministic and order-independent", () => {
    const a = run({ mode: "balanced" });
    const b = run({ mode: "balanced" }, [...goals].reverse());
    expect(a).toEqual(b);
  });

  it("never exceeds the pool in any budget mode", () => {
    for (const mode of ["fixed_budget", "priority", "balanced", "target_date"] as const) {
      for (const pool of [0, 1, 999.99, 21000, 33333.33]) {
        const r = run({ mode, monthlyPool: pool, inputs: [{ goalId: "trip", minContribution: 9000, priority: 1 }] });
        expect(r.totalAllocated, `${mode} @ ${pool}`).toBeLessThanOrEqual(pool);
      }
    }
  });

  it("handles no, negative and unknown capacity explicitly", () => {
    expect(run({ monthlyPool: 0 }).assumptions).toContain("capacity_non_positive");
    const neg = run({ monthlyPool: -5000 });
    expect(neg.totalAllocated).toBe(0);
    expect(neg.assumptions).toContain("capacity_non_positive");
    const unknown = run({ mode: "balanced", monthlyPool: null });
    expect(unknown).toMatchObject({ unallocated: null, totalAllocated: 0 });
    expect(unknown.assumptions).toContain("capacity_unknown");
  });

  it("shows trade-offs against the current plan", () => {
    const r = run({
      mode: "priority",
      monthlyPool: 21000,
      inputs: [
        { goalId: "fund", priority: 1, currentContribution: 2000 },
        { goalId: "trip", priority: 2, currentContribution: 9000 },
        { goalId: "car", priority: 3, currentContribution: 10000 },
      ],
    });
    expect(r.tradeOffs).toEqual([{ goalId: "fund", affects: [{ goalId: "car", monthly: 4000 }] }, { goalId: "trip", affects: [{ goalId: "car", monthly: 4000 }] }]);
  });

  it("handles funded, excluded and undated goals without breaking the split", () => {
    const g = [...goals, { goalId: "done", name: "Done", targetAmount: 1000, currentAmount: 1000, targetDate: "2027-01-01" }, { goalId: "nodate", name: "Someday", targetAmount: 50000, currentAmount: 0 }];
    const r = run({ mode: "balanced", monthlyPool: 21000, inputs: [{ goalId: "car", excluded: true }] }, g);
    const byId = Object.fromEntries(r.goals.map((x) => [x.goalId, x]));
    expect(byId.car.status).toBe("excluded");
    expect(byId.done.status).toBe("funded");
    expect(byId.nodate.status).toBe("no_target_date");
    expect(r.assumptions).toContain("target_date_missing");
    expect(r.totalAllocated).toBeLessThanOrEqual(21000);
  });

  it("does not change the goals", () => {
    const before = JSON.stringify(goals);
    run({ mode: "priority", inputs: [{ goalId: "car", priority: 1 }] });
    expect(JSON.stringify(goals)).toBe(before);
  });

  it("is fast for many goals", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ goalId: `g${i}`, name: `G${i}`, targetAmount: 10000 * (i + 1), currentAmount: 0, targetDate: `2028-${String((i % 12) + 1).padStart(2, "0")}-15` }));
    const t0 = performance.now();
    for (let k = 0; k < 20; k++) run({ mode: "balanced", monthlyPool: 100000 }, many);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
