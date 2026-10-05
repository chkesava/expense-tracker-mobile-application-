import { describe, expect, it } from "vitest";

import { runWhatIfProjection, applyWhatIfAdjustments } from "./whatIfEngine";
import { WHAT_IF_ENGINE_VERSION, type WhatIfBaselineSnapshot, type WhatIfScenarioDefinition } from "../types/whatIf";
import type { RunwayEvent } from "./runwayEngine";

const reference = { asOfDate: "2026-10-04", currency: "INR", timezone: "Asia/Calcutta", sourceVersions: [] };
const provenance = { kind: "user" as const, source: "test", asOfDate: reference.asOfDate };
const baseline = (): WhatIfBaselineSnapshot => ({
  reference,
  liquid: 10_000,
  baseline: { monthlyEarnedIncome: 1_000, monthlyOutflowByClass: { essential: 500 } },
  events: [],
});
const scenario = (): WhatIfScenarioDefinition => ({
  id: "scenario-1",
  name: "Test scenario",
  version: 1,
  engineVersion: WHAT_IF_ENGINE_VERSION,
  reference,
  durationMonths: 3,
  adjustments: [],
  assumptions: [],
});

describe("What-If projection engine", () => {
  it("reproduces the baseline when there are no adjustments", () => {
    const result = runWhatIfProjection({ today: reference.asOfDate, mode: "commitment_projection", threshold: { kind: "none" }, scenario: scenario(), baseline: baseline() });
    expect(result.issues).toEqual([]);
    expect(result.scenario.periods).toEqual(result.baseline.periods);
    expect(result.periods.every((period) => period.closingDelta === 0)).toBe(true);
  });

  it("applies a one-time event exactly once and reports its delta", () => {
    const input = scenario();
    input.adjustments = [{ id: "phone", label: "Phone", kind: "expense", operation: "add", direction: "out", amount: 600, schedule: { kind: "once", date: "2026-10-05" }, provenance }];
    const result = runWhatIfProjection({ today: reference.asOfDate, mode: "commitment_projection", threshold: { kind: "none" }, scenario: input, baseline: baseline() });
    expect(result.issues).toEqual([]);
    expect(result.scenario.expectedOutflow - result.baseline.expectedOutflow).toBeCloseTo(600, 8);
    expect(result.periods[0]?.closingDelta).toBe(-600);
    expect(result.periods[1]?.closingDelta).toBe(-600);
  });

  it("uses the existing recurring schedule semantics", () => {
    const input = scenario();
    input.adjustments = [{ id: "subscription", label: "Subscription", kind: "commitment", operation: "add", direction: "out", amount: 50, schedule: { kind: "monthly", firstDate: "2026-10-05", dayOfMonth: 5 }, provenance }];
    const result = runWhatIfProjection({ today: reference.asOfDate, mode: "commitment_projection", threshold: { kind: "none" }, scenario: input, baseline: baseline() });
    expect(result.scenario.expectedOutflow - result.baseline.expectedOutflow).toBe(150);
  });

  it("removes and replaces only explicitly referenced baseline events", () => {
    const event: RunwayEvent = { id: "subscription:s1:2026-10-05", label: "Old", source: "subscription", direction: "out", amount: 100, certainty: "expected", schedule: { kind: "monthly", firstDate: "2026-10-05", dayOfMonth: 5 } };
    const removed = applyWhatIfAdjustments([event], [{ id: "remove", label: "Remove", kind: "commitment", operation: "remove", direction: "out", amount: 0, schedule: event.schedule, sourceRef: { source: "subscription", refId: "s1" }, provenance }]);
    expect(removed.events).toEqual([]);
    const replaced = applyWhatIfAdjustments([event], [{ id: "replace", label: "New", kind: "commitment", operation: "replace", direction: "out", amount: 200, schedule: event.schedule, sourceRef: { source: "subscription", refId: "s1" }, provenance }]);
    expect(replaced.events).toHaveLength(1);
    expect(replaced.events[0]?.amount).toBe(200);
  });

  it("does not mutate baseline inputs and keeps unknown liquid unsafe", () => {
    const base = baseline();
    const before = JSON.stringify(base);
    const unknown = { ...base, liquid: null };
    const result = runWhatIfProjection({ today: reference.asOfDate, mode: "commitment_projection", threshold: { kind: "none" }, scenario: scenario(), baseline: unknown });
    expect(JSON.stringify(base)).toBe(before);
    expect(result.scenario.result.state).toBe("insufficient_data");
    expect(result.issues).toContain("baseline.liquid is unknown");
  });
});
