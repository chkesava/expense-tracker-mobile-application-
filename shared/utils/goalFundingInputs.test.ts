import { describe, expect, it } from "vitest";

import type { Borrowing } from "../types/borrowing";
import type { Subscription } from "../types/subscription";
import { queryCalendar, type CalendarData } from "./calendarQuery";
import { applyCapacityAdjustments, goalFundingCapacityFromSources, planningWindow } from "./goalFundingInputs";
import { buildFundingCapacity } from "./goalFundingCapacity";

const TODAY = "2026-10-15";
const baseline = { monthlyEarnedIncome: 100000, monthlyOutflowByClass: { essential: 50000, discretionary: 10000, savings_contribution: 5000 } };
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
const emi = (over: Partial<Subscription> = {}): Subscription => ({ id: "emi", name: "Car EMI", amount: 12000, category: "Finance, Loans & Insurance", dayOfMonth: 5, isActive: true, lastProcessed: "2026-10", type: "emi", ...over });

function capacityFor(data: Partial<CalendarData>) {
  const window = planningWindow(TODAY);
  const q = queryCalendar({ range: window, today: TODAY, currency: "INR", data: { ...empty(), ...data } });
  return goalFundingCapacityFromSources({ baseline, calendarEvents: q.events, window });
}

describe("planning window", () => {
  it("covers N months from today, clamping month ends", () => {
    expect(planningWindow(TODAY)).toEqual({ from: "2026-10-15", to: "2027-01-14" });
    expect(planningWindow("2026-11-30", 3)).toEqual({ from: "2026-11-30", to: "2027-02-27" });
    expect(planningWindow("2027-12-31", 2)).toEqual({ from: "2027-12-31", to: "2028-02-28" });
  });
});

describe("calendar commitments update goal funding", () => {
  it("a new EMI reduces capacity and cancelling it restores capacity", () => {
    const without = capacityFor({});
    const withEmi = capacityFor({ subscriptions: [emi()] });
    const cancelled = capacityFor({ subscriptions: [emi({ isActive: false })] });
    expect(without.monthly).toBe(40000);
    expect(withEmi.monthly).toBe(28000); // 3 instalments in 3 months
    expect(cancelled.monthly).toBe(40000);
  });

  it("ignores completed items and lists commitments without an amount", () => {
    const loans = [
      { id: "settled", lenderName: "A", dueDate: "2026-11-01", status: "FULLY_SETTLED", totalOutstanding: 0 },
      { id: "unknown", lenderName: "B", dueDate: "2026-11-20", status: "ACTIVE" },
    ] as Borrowing[];
    const c = capacityFor({ borrowings: loans });
    expect(c.monthly).toBe(40000);
    expect(c.commitmentsWithoutAmount.map((e) => e.refId)).toEqual(["unknown"]);
  });

  it("does not modify any record", () => {
    const subs = [emi()];
    const before = JSON.stringify(subs);
    capacityFor({ subscriptions: subs });
    expect(JSON.stringify(subs)).toBe(before);
  });
});

describe("hypothetical adjustments (What-If hook)", () => {
  const base = buildFundingCapacity({ baseline, events: [], window: planningWindow(TODAY) });

  it("applies on top of real capacity, labelled hypothetical, without changing the real figure", () => {
    const a = applyCapacityAdjustments(base, [
      { id: "raise", label: "Salary +10%", monthlyDelta: 10000, source: "what_if" },
      { id: "emi", label: "New phone EMI", monthlyDelta: -3000, source: "user" },
    ]);
    expect(a).toMatchObject({ monthly: 47000, baseMonthly: 40000, hypothetical: true });
    expect(base.monthly).toBe(40000);
  });

  it("ignores zero/invalid adjustments and never adjusts unknown capacity", () => {
    expect(applyCapacityAdjustments(base, [{ id: "x", label: "x", monthlyDelta: 0, source: "user" }]).hypothetical).toBe(false);
    const unknown = buildFundingCapacity({ baseline: null, events: [], window: planningWindow(TODAY) });
    expect(applyCapacityAdjustments(unknown, [{ id: "x", label: "x", monthlyDelta: 5000, source: "what_if" }])).toMatchObject({ monthly: null, hypothetical: false });
  });

  it("can push capacity negative and says so", () => {
    expect(applyCapacityAdjustments(base, [{ id: "x", label: "x", monthlyDelta: -50000, source: "what_if" }])).toMatchObject({ monthly: -10000, status: "negative" });
  });
});
