import { describe, expect, it } from "vitest";

import type { GoalSnapshot } from "../types/goalFunding";
import { analyzeGoal, contributionDates, extraToFinishEarlier, monthsBetween, projectCompletion, remainingAmount, requiredMonthly } from "./goalFundingMath";

const TODAY = "2026-10-15";
const goal = (over: Partial<GoalSnapshot> = {}): GoalSnapshot => ({ goalId: "trip", name: "Trip", targetAmount: 120000, currentAmount: 0, targetDate: "2027-09-15", ...over });

describe("dates", () => {
  it("counts monthly contributions inclusive, clamping short months and leap Februaries", () => {
    expect(contributionDates("2026-10-15", "2027-09-15")).toHaveLength(12);
    expect(contributionDates("2026-10-15", "2027-09-14")).toHaveLength(11);
    expect(contributionDates("2028-01-31", "2028-03-31")).toEqual(["2028-01-31", "2028-02-29", "2028-03-31"]);
    expect(contributionDates("2026-10-15", "2026-10-01")).toEqual([]);
  });

  it("measures whole months", () => {
    expect(monthsBetween("2026-10-15", "2027-09-15")).toBe(11);
    expect(monthsBetween("2026-10-15", "2027-09-14")).toBe(10);
    expect(monthsBetween("2026-10-15", "2026-08-15")).toBe(-2);
  });
});

describe("required contribution", () => {
  it("splits the remaining amount over the contributions before the target", () => {
    expect(requiredMonthly(goal(), { goalId: "trip" }, TODAY)).toEqual({ amount: 10000, contributions: 12 });
    expect(requiredMonthly(goal({ currentAmount: 30000 }), { goalId: "trip" }, TODAY).amount).toBe(7500);
  });

  it("counts a one-time top-up only if it lands by the target date", () => {
    expect(remainingAmount(goal(), { goalId: "trip", oneTime: { amount: 24000, date: "2027-01-01" } })).toBe(96000);
    expect(remainingAmount(goal(), { goalId: "trip", oneTime: { amount: 24000, date: "2028-01-01" } })).toBe(120000);
    expect(requiredMonthly(goal(), { goalId: "trip", oneTime: { amount: 24000, date: "2027-01-01" } }, TODAY).amount).toBe(8000);
  });

  it("rounds up to the paisa so following it never falls short", () => {
    const r = requiredMonthly(goal({ targetAmount: 100000 }), { goalId: "trip" }, TODAY).amount!;
    expect(r).toBe(8333.34);
    expect(r * 12).toBeGreaterThanOrEqual(100000);
  });

  it("needs less with an explicit growth assumption, and is deterministic", () => {
    const flat = requiredMonthly(goal(), { goalId: "trip" }, TODAY).amount!;
    const grown = requiredMonthly(goal(), { goalId: "trip", annualReturnPct: 12 }, TODAY).amount!;
    expect(grown).toBeLessThan(flat);
    expect(requiredMonthly(goal(), { goalId: "trip", annualReturnPct: 12 }, TODAY).amount).toBe(grown);
    // Following the required amount actually reaches the target.
    expect(projectCompletion(goal(), { goalId: "trip", annualReturnPct: 12 }, grown, TODAY)! <= "2027-09-15").toBe(true);
  });

  it("handles funded, missing and past target dates safely", () => {
    expect(requiredMonthly(goal({ currentAmount: 200000 }), { goalId: "trip" }, TODAY).amount).toBe(0);
    expect(requiredMonthly(goal({ targetDate: undefined }), { goalId: "trip" }, TODAY).amount).toBeNull();
    expect(requiredMonthly(goal({ targetDate: "2026-01-01" }), { goalId: "trip" }, TODAY)).toEqual({ amount: 120000, contributions: 0 });
  });
});

describe("projection", () => {
  it("finds the completion date at a given monthly amount", () => {
    expect(projectCompletion(goal(), { goalId: "trip" }, 10000, TODAY)).toBe("2027-09-15");
    expect(projectCompletion(goal(), { goalId: "trip" }, 20000, TODAY)).toBe("2027-03-15");
    expect(projectCompletion(goal(), { goalId: "trip" }, 0, TODAY)).toBeNull();
    expect(projectCompletion(goal({ currentAmount: 120000 }), { goalId: "trip" }, 0, TODAY)).toBe(TODAY);
  });

  it("works out the extra needed to finish earlier", () => {
    expect(extraToFinishEarlier(goal(), { goalId: "trip" }, TODAY, 2, 10000)).toBe(2000);
  });
});

describe("analysis", () => {
  it("reports gap, completion, months ahead/behind and change vs current", () => {
    const behind = analyzeGoal(goal(), { goalId: "trip", currentContribution: 8000 }, TODAY);
    expect(behind).toMatchObject({ requiredMonthly: 10000, allocatedMonthly: 8000, gapMonthly: -2000, status: "behind", changeVsCurrent: 0 });
    expect(behind.monthsAheadOfTarget).toBeLessThan(0);
    const ahead = analyzeGoal(goal(), { goalId: "trip", currentContribution: 8000 }, TODAY, 20000);
    expect(ahead).toMatchObject({ gapMonthly: 10000, status: "ahead", projectedCompletion: "2027-03-15", monthsAheadOfTarget: 6, changeVsCurrent: 12000 });
    expect(analyzeGoal(goal(), { goalId: "trip" }, TODAY, 10000)).toMatchObject({ status: "on_track", currentMonthly: null, changeVsCurrent: null });
  });

  it("reconciles to the goal's target and balance without changing the goal", () => {
    const g = goal({ currentAmount: 30000 });
    const before = JSON.stringify(g);
    const r = analyzeGoal(g, { goalId: "trip" }, TODAY, 7500);
    expect(r.remaining).toBe(90000);
    expect(r.requiredMonthly! * 12).toBe(r.remaining);
    expect(JSON.stringify(g)).toBe(before);
  });

  it("labels funded, no date, past date, excluded and growth without promising returns", () => {
    expect(analyzeGoal(goal({ currentAmount: 500000 }), { goalId: "trip" }, TODAY).status).toBe("funded");
    expect(analyzeGoal(goal({ targetDate: undefined }), { goalId: "trip" }, TODAY, 1000).status).toBe("no_target_date");
    expect(analyzeGoal(goal({ targetDate: "2026-01-01" }), { goalId: "trip" }, TODAY, 1000).status).toBe("target_date_passed");
    expect(analyzeGoal(goal(), { goalId: "trip", excluded: true }, TODAY).status).toBe("excluded");
    const reasons = analyzeGoal(goal(), { goalId: "trip", annualReturnPct: 8 }, TODAY, 10000).reasons.join(" ");
    expect(reasons).toMatch(/not a guarantee/);
    expect(reasons).not.toMatch(/guaranteed|will earn/i);
  });
});
