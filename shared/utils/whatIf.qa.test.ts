/**
 * SPENDLY-203 — end-to-end QA for the What If Simulator (epic SPENDLY-195).
 *
 * Calculation matrix with reconciliation: every scenario delta must equal the
 * sum of its own hypothetical events over the projection, computed
 * independently with the engine's own schedule expansion. Also: isolation
 * (no real-record writes, inputs never mutated), boundaries, missing data and
 * performance on a prepared baseline. Summarised in
 * docs/SPENDLY-203-what-if-qa.md.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { Subscription } from "../types/subscription";
import { WHAT_IF_LIMITS, validateWhatIfAdjustment, type WhatIfAdjustment, type WhatIfBaselineSnapshot } from "../types/whatIf";
import { occurrencesBetween, type RunwayEvent } from "./runwayEngine";
import { subscriptionsToRunwayEvents } from "./runwayEvents";
import type { RunwayBaselineResult } from "./runwayBaseline";
import { buildWhatIfBaselineSnapshot } from "./whatIfBaseline";
import { buildCashflowAdjustments } from "./whatIfCashflow";
import { buildWhatIfChange, newWhatIfDraft, nextMonthStart, whatIfChangeId, withWhatIfChange, type WhatIfChangeForm } from "./whatIfDraft";
import { simulateWhatIfLoan } from "./whatIfLoan";
import { runWhatIf, whatIfHeadline, whatIfMetricRows, whatIfTimelineRows, WHAT_IF_DISCLOSURES, type WhatIfRun } from "./whatIfView";

const TODAY = "2026-10-15";
const fmt = (n: number) => `₹${Math.round(n)}`;
const ref = (asOfDate = TODAY) => ({ asOfDate, currency: "INR", timezone: "Asia/Calcutta", sourceVersions: [] });
const rent: RunwayEvent = { id: "subscription:rent", label: "Rent", source: "subscriptions", direction: "out", amount: 20_000, burnClass: "essential", certainty: "expected", schedule: { kind: "monthly", firstDate: "2026-11-05", dayOfMonth: 5 } };
const snapshot = (over: Partial<WhatIfBaselineSnapshot> = {}, today = TODAY): WhatIfBaselineSnapshot => ({
  reference: ref(today),
  liquid: 200_000,
  baseline: { monthlyEarnedIncome: 80_000, monthlyOutflowByClass: { essential: 30_000, discretionary: 15_000 } },
  events: [rent],
  ...over,
});

let seq = 0;
function scenarioOf(forms: WhatIfChangeForm[], months = 12, today = TODAY) {
  let draft = newWhatIfDraft({ name: "QA", reference: ref(today), durationMonths: months });
  for (const form of forms) {
    const id = whatIfChangeId(form.type, `q${seq++}`);
    const built = buildWhatIfChange(id, form, today);
    expect(built.issues, JSON.stringify(form)).toEqual([]);
    draft = withWhatIfChange(draft, id, built);
  }
  return draft;
}
const runOf = (draft: ReturnType<typeof scenarioOf>, base = snapshot(), today = TODAY) => runWhatIf({ scenario: draft, baseline: base, threshold: { kind: "none" } });
const closingDelta = (r: WhatIfRun) => r.comparison.metrics.find((m) => m.key === "closing_balance")!.delta!;

/** Independent expectation: Σ signed amount × occurrences in the projection window. */
function expectedDelta(r: WhatIfRun, adjustments: readonly WhatIfAdjustment[], baselineEvents: readonly RunwayEvent[] = []): number {
  const from = r.output.baseline.periods[0].startDate;
  const to = r.output.baseline.horizonEnd;
  let total = 0;
  for (const a of adjustments) {
    if (a.operation === "add") {
      total += (a.direction === "in" ? 1 : -1) * a.amount * occurrencesBetween(a.schedule, from, to).length;
    } else {
      const removed = baselineEvents.filter((e) => a.sourceRef && (e.id === a.sourceRef.refId || e.id === `${a.sourceRef.source}:${a.sourceRef.refId}`));
      for (const e of removed) total -= (e.direction === "in" ? 1 : -1) * e.amount * occurrencesBetween(e.schedule, from, to).length;
      if (a.operation === "replace") total += (a.direction === "in" ? 1 : -1) * a.amount * occurrencesBetween(a.schedule, from, to).length;
    }
  }
  return Math.round(total * 100) / 100;
}

/** The engine's periods must chain and reconcile to liquid + net flows. */
function expectReconciles(r: WhatIfRun) {
  for (const side of [r.output.baseline, r.output.scenario]) {
    let opening = side.liquid;
    for (const p of side.periods) {
      expect(p.opening).toBeCloseTo(opening, 2);
      expect(p.closing).toBeCloseTo(p.opening + p.inflow - p.outflow, 2);
      opening = p.closing;
    }
  }
}

describe("calculation matrix (with reconciliation)", () => {
  it("an empty scenario equals the baseline exactly", () => {
    const r = runOf(scenarioOf([]));
    expect(closingDelta(r)).toBe(0);
    expect(r.output.periods.every((p) => p.closingDelta === 0)).toBe(true);
    expectReconciles(r);
  });

  it.each([
    ["income increase", { type: "income_change", label: "Raise", amount: 10_000, direction: "increase", startDate: nextMonthStart(TODAY) }],
    ["income decrease", { type: "income_change", label: "Pay cut", amount: 5_000, direction: "decrease", startDate: nextMonthStart(TODAY) }],
    ["new monthly expense", { type: "expense_change", label: "Gym", amount: 2_500, direction: "increase", startDate: nextMonthStart(TODAY) }],
    ["cut a monthly expense", { type: "expense_change", label: "Less dining", amount: 3_000, direction: "decrease", startDate: nextMonthStart(TODAY) }],
    ["one-time purchase", { type: "purchase", label: "Phone", amount: 45_000, startDate: "2027-01-10" }],
    ["one-time income", { type: "one_time_income", label: "Bonus", amount: 60_000, startDate: "2027-03-31" }],
    ["monthly saving", { type: "savings", label: "Goal", amount: 7_000, startDate: nextMonthStart(TODAY) }],
    ["recurring change with an end date", { type: "expense_change", label: "Course", amount: 4_000, direction: "increase", startDate: "2026-11-01", untilDate: "2027-02-28" }],
  ] as [string, WhatIfChangeForm][])("%s reconciles to its own events", (_name, form) => {
    const draft = scenarioOf([form]);
    const r = runOf(draft);
    expectReconciles(r);
    expect(closingDelta(r)).toBeCloseTo(expectedDelta(r, draft.adjustments), 2);
    expect(closingDelta(r)).not.toBe(0);
  });

  it("removing an existing commitment adds back exactly its occurrences", () => {
    const remove = buildCashflowAdjustments({ id: "cancel-rent", label: "Move in with family", kind: "expense", action: "remove", amount: 0, schedule: rent.schedule, sourceRef: { source: "subscription", refId: "rent" }, provenance: { kind: "user", source: "qa", asOfDate: TODAY } });
    const draft = { ...newWhatIfDraft({ name: "QA", reference: ref() }), adjustments: remove };
    const r = runOf(draft);
    expect(r.output.appliedAdjustments[0].matchedEvents).toBe(1);
    expect(closingDelta(r)).toBeCloseTo(expectedDelta(r, remove, [rent]), 2);
    expect(closingDelta(r)).toBeGreaterThan(0);
  });

  it("EMI amortization: payments sum to principal + interest and the delta reconciles", () => {
    const loan = simulateWhatIfLoan({ id: "car", label: "Car", principal: 500_000, annualInterestRatePct: 9, tenureMonths: 36, frequency: "monthly", startDate: "2026-11-01", provenance: { kind: "user", source: "qa", asOfDate: TODAY } });
    expect(loan.issues).toEqual([]);
    const paid = loan.payments.reduce((s, p) => s + p.payment, 0);
    expect(paid).toBeCloseTo(loan.totalRepayment, 0);
    expect(loan.totalRepayment - loan.totalInterest).toBeCloseTo(500_000, 0);
    expect(loan.payments.at(-1)!.closingPrincipal).toBeCloseTo(0, 2);
    const draft = scenarioOf([{ type: "loan", label: "Car", amount: 500_000, startDate: "2026-11-01", annualInterestRatePct: 9, tenureMonths: 36, downPayment: 50_000, fees: 2_000 }]);
    const r = runOf(draft);
    expect(closingDelta(r)).toBeCloseTo(expectedDelta(r, draft.adjustments), 2);
  });

  it("zero-interest loan repays exactly the principal", () => {
    const loan = simulateWhatIfLoan({ id: "z", label: "No-cost EMI", principal: 60_000, annualInterestRatePct: 0, tenureMonths: 6, frequency: "monthly", startDate: "2026-11-01", provenance: { kind: "user", source: "qa", asOfDate: TODAY } });
    expect(loan.totalInterest).toBe(0);
    expect(loan.paymentAmount).toBeCloseTo(10_000, 2);
  });

  it("multiple simultaneous assumptions add up to the sum of their parts", () => {
    const forms: WhatIfChangeForm[] = [
      { type: "income_change", label: "Raise", amount: 10_000, direction: "increase", startDate: nextMonthStart(TODAY) },
      { type: "purchase", label: "Laptop", amount: 90_000, startDate: "2027-02-01" },
      { type: "savings", label: "Goal", amount: 5_000, startDate: nextMonthStart(TODAY) },
      { type: "loan", label: "Bike", amount: 120_000, startDate: "2026-12-01", annualInterestRatePct: 11, tenureMonths: 24 },
    ];
    const all = runOf(scenarioOf(forms));
    const parts = forms.map((f) => closingDelta(runOf(scenarioOf([f]))));
    expect(closingDelta(all)).toBeCloseTo(parts.reduce((a, b) => a + b, 0), 2);
    expectReconciles(all);
  });

  it("existing commitments are kept, never double counted", () => {
    const draft = scenarioOf([{ type: "purchase", label: "TV", amount: 30_000, startDate: "2027-01-01" }]);
    const r = runOf(draft);
    const rentOccurrences = occurrencesBetween(rent.schedule, r.output.baseline.periods[0].startDate, r.output.baseline.horizonEnd).length;
    expect(rentOccurrences).toBeGreaterThan(0);
    expect(closingDelta(r)).toBe(-30_000);
  });
});

describe("boundaries and edge cases", () => {
  it("month-end and year boundaries: a 31st start clamps to short months and crosses the year", () => {
    const draft = scenarioOf([{ type: "expense_change", label: "Month-end bill", amount: 1_000, direction: "increase", startDate: "2026-12-31" }], 12, TODAY);
    const r = runOf(draft);
    const months = r.output.baseline.periods.map((p) => p.month);
    expect(months).toContain("2027-01");
    expect(closingDelta(r)).toBeCloseTo(expectedDelta(r, draft.adjustments), 2);
    // Feb 2027 still gets its occurrence (clamped to the 28th).
    expect(occurrencesBetween(draft.adjustments[0].schedule, "2027-02-01", "2027-02-28")).toEqual(["2027-02-28"]);
  });

  it("leap years: a Feb 29 start lands on Feb 29, 2028 and on Feb 28 in 2029", () => {
    const today = "2028-02-29";
    const draft = scenarioOf([{ type: "savings", label: "Leap", amount: 1_000, startDate: today }], 13, today);
    const schedule = draft.adjustments[0].schedule;
    expect(occurrencesBetween(schedule, "2028-02-01", "2028-02-29")).toEqual(["2028-02-29"]);
    expect(occurrencesBetween(schedule, "2029-02-01", "2029-02-28")).toEqual(["2029-02-28"]);
    const r = runOf(draft, snapshot({}, today), today);
    expect(closingDelta(r)).toBeCloseTo(expectedDelta(r, draft.adjustments), 2);
  });

  it("negative, zero and past-dated inputs are refused before they reach the engine", () => {
    expect(buildWhatIfChange("purchase--a", { type: "purchase", label: "X", amount: 0, startDate: TODAY }, TODAY).issues).toContain("Enter an amount greater than zero.");
    expect(buildWhatIfChange("purchase--a", { type: "purchase", label: "X", amount: -5, startDate: TODAY }, TODAY).issues).toContain("Enter an amount greater than zero.");
    expect(buildWhatIfChange("purchase--a", { type: "purchase", label: "X", amount: 5, startDate: "2026-01-01" }, TODAY).issues.length).toBe(1);
    const bad: WhatIfAdjustment = { id: "x", label: "x", kind: "expense", operation: "add", direction: "out", amount: -1, schedule: { kind: "once", date: TODAY }, provenance: { kind: "user", source: "qa", asOfDate: TODAY } };
    expect(validateWhatIfAdjustment(bad).length).toBeGreaterThan(0);
  });

  it("missing data says so instead of inventing a result", () => {
    expect(whatIfHeadline(runOf(scenarioOf([]), snapshot({ liquid: null })).comparison, fmt).title).toBe("Not enough data yet");
    const noBaseline = runOf(scenarioOf([{ type: "purchase", label: "X", amount: 100, startDate: TODAY }]), snapshot({ baseline: null, events: [] }));
    expect(noBaseline.comparison).toBeDefined();
  });

  it("very long projections: 24 months works, 25 is refused", () => {
    const long = runOf(scenarioOf([{ type: "savings", label: "S", amount: 1_000, startDate: nextMonthStart(TODAY) }], WHAT_IF_LIMITS.maxProjectionMonths));
    expect(long.output.baseline.periods.length).toBeGreaterThanOrEqual(24);
    expect(long.output.issues).toEqual([]);
    const tooLong = runOf({ ...scenarioOf([]), durationMonths: 25 });
    expect(tooLong.output.issues.join(" ")).toMatch(/durationMonths/);
  });

  it("recalculation is deterministic for the same inputs", () => {
    const draft = scenarioOf([{ type: "loan", label: "L", amount: 100_000, startDate: "2026-11-01", annualInterestRatePct: 12, tenureMonths: 12 }]);
    expect(JSON.stringify(runOf(draft).comparison)).toBe(JSON.stringify(runOf(draft).comparison));
  });
});

describe("labelling and accessibility of results", () => {
  it("every metric and month has a full-sentence screen-reader label, and outputs are marked as estimates", () => {
    const r = runOf(scenarioOf([{ type: "purchase", label: "Phone", amount: 30_000, startDate: TODAY }]));
    for (const row of whatIfMetricRows(r.comparison, fmt)) expect(row.accessibilityLabel).toMatch(/with this scenario/);
    for (const row of whatIfTimelineRows(r.comparison, fmt)) expect(row.accessibilityLabel).toMatch(/current path .* scenario .* difference/);
    expect(WHAT_IF_DISCLOSURES.join(" ")).toMatch(/planning estimate/);
    expect(WHAT_IF_DISCLOSURES.join(" ")).toMatch(/not modelled/);
  });
});

describe("isolation", () => {
  it("projection and builders never mutate the baseline, scenario or source records", () => {
    const subs: Subscription[] = [{ id: "s1", name: "Netflix", amount: 649, isActive: true, dayOfMonth: 3, type: "subscription", category: "Entertainment & Hobbies" } as Subscription];
    const expenses = [{ amount: 100 }];
    const before = JSON.stringify({ subs, expenses });
    const base = buildWhatIfBaselineSnapshot({
      today: TODAY,
      currency: "INR",
      timezone: "Asia/Calcutta",
      liquid: 1000,
      runwayBaseline: { projectionBaseline: { monthlyEarnedIncome: 10, monthlyOutflowByClass: { essential: 5 } } } as unknown as RunwayBaselineResult,
      subscriptions: subs,
      bills: [],
      expenses,
      incomes: [],
    });
    const draft = scenarioOf([{ type: "loan", label: "L", amount: 10_000, startDate: "2026-11-01", annualInterestRatePct: 10, tenureMonths: 6 }]);
    const frozen = JSON.stringify({ base, draft });
    runOf(draft, base);
    expect(JSON.stringify({ base, draft })).toBe(frozen);
    expect(JSON.stringify({ subs, expenses })).toBe(before);
    expect(subscriptionsToRunwayEvents(subs, TODAY)[0].id).toBe("subscription:s1");
  });

  it("What If code writes only to whatIfScenarios, through the one store", () => {
    const files = [
      ...["app/(app)/what-if", "components/whatIf", "services/whatIf"].flatMap((d) => readdirSync(d).map((f) => join(d, f))),
      "hooks/useWhatIfBaseline.ts",
      "hooks/useWhatIfScenarios.ts",
      ...readdirSync("shared/utils").filter((f) => f.startsWith("whatIf") && !f.includes(".test.")).map((f) => join("shared/utils", f)),
    ].filter((f) => /\.tsx?$/.test(f));
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // No reference to a financial collection as a write target, and no ledger/goal/subscription mutation API.
      expect(src, f).not.toMatch(/(collection|doc)\([^)]*"(expenses|incomes|accounts|financialGoals|investments|holdings|subscriptions|calendarReminders|creditCardBills|accountTransfers|borrowings)"/);
      expect(src, f).not.toMatch(/\b(addExpense|updateExpense|deleteExpense|addIncome|updateAccount|updateGoalProgress|addGoal|deleteGoal|addSubscription|updateSubscription|createCalendarReminder)\(/);
      if (/commitMutations|setDoc|updateDoc|deleteDoc|addDoc|writeBatch/.test(src)) {
        expect(f, "only the scenario store may write").toBe(join("services/whatIf", "whatIfScenarioStore.ts"));
      }
    }
    expect(readFileSync("services/whatIf/whatIfScenarioStore.ts", "utf8")).toMatch(/WHAT_IF_SCENARIOS_COLLECTION = "whatIfScenarios"/);
  });
});

describe("performance on a prepared baseline", () => {
  it("building the baseline from a large history is cheap, and is done once — not per input change", () => {
    const expenses = Array.from({ length: 25_000 }, (_, i) => ({ amount: (i % 500) + 1 }));
    const t0 = performance.now();
    buildWhatIfBaselineSnapshot({
      today: TODAY,
      currency: "INR",
      timezone: "Asia/Calcutta",
      liquid: 500_000,
      runwayBaseline: { projectionBaseline: { monthlyEarnedIncome: 1, monthlyOutflowByClass: {} } } as unknown as RunwayBaselineResult,
      subscriptions: [],
      bills: [],
      expenses,
      incomes: expenses.slice(0, 200),
    });
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it("repeated recalculation of a busy 24-month scenario stays fast", () => {
    const events: RunwayEvent[] = Array.from({ length: 60 }, (_, i) => ({ ...rent, id: `subscription:s${i}`, label: `Sub ${i}`, amount: 500 + i, schedule: { kind: "monthly", firstDate: "2026-11-01", dayOfMonth: (i % 28) + 1 } }));
    const forms: WhatIfChangeForm[] = Array.from({ length: 20 }, (_, i) =>
      i % 4 === 0
        ? { type: "loan", label: `Loan ${i}`, amount: 50_000, startDate: "2026-11-01", annualInterestRatePct: 10, tenureMonths: 24 }
        : { type: i % 2 ? "purchase" : "savings", label: `Change ${i}`, amount: 1_000 + i, startDate: "2026-11-01" }
    );
    const draft = scenarioOf(forms, 24);
    const base = snapshot({ events });
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) runOf(draft, base);
    const perRun = (performance.now() - t0) / 50;
    // An input change re-runs this once; it must stay well inside a frame budget on a mid-range phone.
    expect(perRun).toBeLessThan(60);
  });
});
