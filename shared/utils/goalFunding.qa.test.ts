/**
 * SPENDLY-221 — end-to-end QA for the Goal Funding Optimizer (epic SPENDLY-213).
 *
 * Covers the ticket's calculation matrix (one/many goals, no/negative/excess
 * surplus, equal/different dates, priority, minimums, completed and past
 * goals, one-time and recurring contributions, growth, combined constraints,
 * month/year boundaries, calendar commitments, what-if adjustments), proves
 * isolation (no goal/transaction/account/investment/calendar writes) and
 * checks performance on realistic data. Summarised in
 * docs/SPENDLY-221-goal-funding-qa.md.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { Expense, FinancialGoal, Income } from "../types/expense";
import type { GoalFundingScenario, GoalSnapshot } from "../types/goalFunding";
import type { Subscription } from "../types/subscription";
import { queryCalendar, type CalendarData } from "./calendarQuery";
import { goalFundingCapacityFromSources, planningWindow } from "./goalFundingInputs";
import { requiredMonthly } from "./goalFundingMath";
import { snapshotGoals } from "./goalFundingModel";
import { runGoalFundingScenario } from "./goalFundingOptimizer";
import { goalFundingPlanDoc } from "./goalFundingPlans";
import { buildRunwayBaseline } from "./runwayBaseline";

const TODAY = "2026-10-15";
const g = (goalId: string, targetAmount: number, targetDate?: string, currentAmount = 0): GoalSnapshot => ({ goalId, name: goalId, targetAmount, currentAmount, targetDate });
const run = (goals: GoalSnapshot[], over: Partial<GoalFundingScenario>, today = TODAY) =>
  runGoalFundingScenario({ goals, today, scenario: { mode: "balanced", monthlyPool: 30000, allowOverAllocation: false, inputs: [], ...over } });
const byId = (r: ReturnType<typeof run>) => Object.fromEntries(r.goals.map((x) => [x.goalId, x]));

describe("calculation matrix", () => {
  it("one goal", () => {
    const r = run([g("a", 120000, "2027-09-15")], { mode: "target_date" });
    expect(byId(r).a).toMatchObject({ requiredMonthly: 10000, allocatedMonthly: 10000, status: "on_track" });
  });

  it("multiple goals with equal and different target dates", () => {
    const equal = run([g("a", 120000, "2027-09-15"), g("b", 60000, "2027-09-15")], { mode: "target_date" });
    expect(equal.totalRequired).toBe(15000);
    const different = run([g("a", 120000, "2027-09-15"), g("b", 60000, "2027-03-15")], { mode: "target_date" });
    expect(byId(different).b.requiredMonthly).toBe(10000);
  });

  it("no, negative and excess surplus", () => {
    const goals = [g("a", 120000, "2027-09-15")];
    expect(run(goals, { monthlyPool: 0 }).totalAllocated).toBe(0);
    expect(run(goals, { monthlyPool: -1000 }).assumptions).toContain("capacity_non_positive");
    const excess = run(goals, { mode: "fixed_budget", monthlyPool: 50000 });
    expect(excess).toMatchObject({ totalAllocated: 10000, unallocated: 40000 });
  });

  it("priority constraints, minimums and combined constraints never exceed the pool", () => {
    const goals = [g("a", 120000, "2027-09-15"), g("b", 240000, "2027-09-15"), g("c", 60000, "2027-09-15")];
    const r = run(goals, {
      mode: "priority",
      monthlyPool: 25000,
      inputs: [
        { goalId: "c", priority: 1, minContribution: 6000 },
        { goalId: "a", priority: 2 },
        { goalId: "b", minContribution: 2000 },
      ],
    });
    expect(byId(r).c.allocatedMonthly).toBeGreaterThanOrEqual(6000);
    expect(byId(r).b.allocatedMonthly).toBeGreaterThanOrEqual(2000);
    expect(r.totalAllocated).toBeLessThanOrEqual(25000);
  });

  it("completed goals and past target dates", () => {
    const r = run([g("done", 1000, "2027-01-01", 1000), g("late", 50000, "2026-01-01", 10000)], { mode: "target_date", monthlyPool: 100000 });
    expect(byId(r).done.status).toBe("funded");
    expect(byId(r).late).toMatchObject({ status: "target_date_passed", requiredMonthly: 40000 });
  });

  it("one-time and recurring (current) contributions", () => {
    const r = run([g("a", 120000, "2027-09-15")], { mode: "target_date", inputs: [{ goalId: "a", oneTime: { amount: 24000, date: "2027-01-01" }, currentContribution: 7000 }] });
    expect(byId(r).a).toMatchObject({ requiredMonthly: 8000, currentMonthly: 7000, changeVsCurrent: 1000 });
  });

  it("growth assumptions lower the requirement and are labelled", () => {
    const flat = requiredMonthly(g("a", 500000, "2031-10-15"), { goalId: "a" }, TODAY).amount!;
    const grown = requiredMonthly(g("a", 500000, "2031-10-15"), { goalId: "a", annualReturnPct: 10 }, TODAY).amount!;
    expect(grown).toBeLessThan(flat);
    expect(run([g("a", 500000, "2031-10-15")], { inputs: [{ goalId: "a", annualReturnPct: 10 }] }).assumptions).toContain("growth_assumed");
  });

  it("month and year boundaries", () => {
    expect(requiredMonthly(g("a", 30000, "2028-02-29"), { goalId: "a", startDate: "2027-12-31" }, "2027-12-31")).toEqual({ amount: 10000, contributions: 3 });
  });
});

describe("calendar commitments and what-if", () => {
  const empty = (): CalendarData => ({
    bills: [],
    cardNames: new Map(),
    subscriptions: [],
    borrowings: [],
    receivables: [],
    incomes: [],
    goals: [],
    investments: [],
    sipPlans: [],
    epfContributions: [],
    epfEmployerNames: new Map(),
  });
  const baseline = { monthlyEarnedIncome: 100000, monthlyOutflowByClass: { essential: 50000, discretionary: 10000 } };
  const emi: Subscription = { id: "emi", name: "EMI", amount: 15000, category: "Finance, Loans & Insurance", dayOfMonth: 5, isActive: true, lastProcessed: "2026-10", type: "emi" };

  it("a new commitment lowers the funding pool and the scenario follows", () => {
    const window = planningWindow(TODAY);
    const cap = (subs: Subscription[]) =>
      goalFundingCapacityFromSources({ baseline, calendarEvents: queryCalendar({ range: window, today: TODAY, currency: "INR", data: { ...empty(), subscriptions: subs } }).events, window });
    expect(cap([]).monthly).toBe(40000);
    expect(cap([emi]).monthly).toBe(25000);
    const goals = [g("a", 600000, "2027-09-15")];
    expect(run(goals, { mode: "fixed_budget", monthlyPool: cap([emi]).monthly }).totalAllocated).toBe(25000);
  });

  it("what-if adjustments stay hypothetical", () => {
    const window = planningWindow(TODAY);
    const c = goalFundingCapacityFromSources({ baseline, calendarEvents: [], window, adjustments: [{ id: "raise", label: "Raise", monthlyDelta: 5000, source: "what_if" }] });
    expect(c).toMatchObject({ monthly: 45000, baseMonthly: 40000, hypothetical: true });
  });
});

describe("isolation", () => {
  it("the engine never mutates goals and plans copy them", () => {
    const goals: FinancialGoal[] = [{ id: "a", name: "A", targetAmount: 100, currentAmount: 10, deadline: "2027-01-01" }];
    const before = JSON.stringify(goals);
    const snap = snapshotGoals(goals);
    run(snap, { mode: "priority", inputs: [{ goalId: "a", priority: 1 }] });
    goalFundingPlanDoc({ name: "p", mode: "balanced", plannedMonthly: null, allowOverAllocation: false, inputs: [], goals: snap, nowMs: 1 }).goalSnapshot[0].currentAmount = 999;
    expect(JSON.stringify(goals)).toBe(before);
    expect(snap[0].currentAmount).toBe(10);
  });

  it("optimizer code writes only to goalFundingPlans", () => {
    const files = [
      ...["app/(app)/goals", "components/goals", "services/goals"].flatMap((d) => readdirSync(d).map((f) => join(d, f))),
      "hooks/useGoalFunding.ts",
      "hooks/useGoalFundingPlans.ts",
      ...readdirSync("shared/utils").filter((f) => f.startsWith("goalFunding") && !f.includes(".test.")).map((f) => join("shared/utils", f)),
    ].filter((f) => /\.tsx?$/.test(f));
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // No writer of any financial collection, and no goal/expense/account mutation API.
      expect(src, f).not.toMatch(/,\s*"(financialGoals|expenses|incomes|accounts|investments|calendarReminders|accountTransfers)"/);
      expect(src, f).not.toMatch(/\b(updateGoalProgress|addGoal|deleteGoal|addExpense|updateAccount)\(/);
      if (/commitMutations|setDoc|updateDoc|deleteDoc|addDoc/.test(src)) {
        expect(f, "only the plan store may write").toBe(join("services/goals", "goalFundingPlanStore.ts"));
      }
    }
  });
});

describe("performance on realistic data", () => {
  it("baseline + calendar + 20 recalculations stay fast", () => {
    const expenses: Expense[] = Array.from({ length: 20000 }, (_, i) =>
      ({ id: `e${i}`, amount: 100 + (i % 500), category: "Food & Groceries", subcategory: "Groceries / Kirana", note: "", date: `2026-${String((i % 9) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`, month: `2026-${String((i % 9) + 1).padStart(2, "0")}`, createdAt: 1 }) as Expense
    );
    const incomes: Income[] = Array.from({ length: 9 }, (_, i) => ({ id: `i${i}`, amount: 150000, source: "Salary", note: "", date: `2026-0${i + 1}-01`, month: `2026-0${i + 1}`, createdAt: 1 }) as Income);
    const goals = Array.from({ length: 20 }, (_, i) => g(`g${i}`, 50000 * (i + 1), `2028-${String((i % 12) + 1).padStart(2, "0")}-15`));
    const t0 = performance.now();
    const b = buildRunwayBaseline({ expenses, incomes, subscriptions: [], today: TODAY, windowMonths: 6, method: "average" });
    const window = planningWindow(TODAY);
    const cap = goalFundingCapacityFromSources({ baseline: b.projectionBaseline, calendarEvents: [], window });
    for (let k = 0; k < 20; k++) run(goals, { mode: (["balanced", "priority", "fixed_budget", "target_date"] as const)[k % 4], monthlyPool: cap.monthly });
    expect(performance.now() - t0).toBeLessThan(2500);
    expect(cap.monthly).not.toBeNull();
  });
});
