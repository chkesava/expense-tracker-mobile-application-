import { describe, expect, it } from "vitest";

import {
  WHAT_IF_ENGINE_VERSION,
  validateWhatIfBaselineSnapshot,
  validateWhatIfScenario,
  type WhatIfScenarioDefinition,
} from "./whatIf";

const provenance = { kind: "user" as const, source: "what-if-form", asOfDate: "2026-10-04" };
const base = (): WhatIfScenarioDefinition => ({
  id: "scenario-1",
  name: "Higher savings",
  version: 1,
  engineVersion: WHAT_IF_ENGINE_VERSION,
  reference: { asOfDate: "2026-10-04", currency: "INR", timezone: "Asia/Calcutta", sourceVersions: [{ source: "runway", version: "1" }] },
  durationMonths: 12,
  adjustments: [],
  assumptions: [],
});

describe("What-If scenario contract", () => {
  it("accepts an empty, minimal scenario", () => {
    expect(validateWhatIfScenario(base())).toEqual([]);
  });

  it("accepts a complex scenario with recurring and one-time adjustments", () => {
    const scenario = base();
    scenario.adjustments = [
      { id: "salary", label: "Salary change", kind: "income", operation: "replace", direction: "in", amount: 5000, schedule: { kind: "monthly", firstDate: "2026-11-01", dayOfMonth: 1 }, provenance },
      { id: "phone", label: "Phone purchase", kind: "expense", operation: "add", direction: "out", amount: 60000, schedule: { kind: "once", date: "2026-12-15" }, provenance },
    ];
    scenario.assumptions = [{ code: "no-tax", label: "Taxes are not modeled", value: true, provenance }];
    expect(validateWhatIfScenario(scenario)).toEqual([]);
  });

  it("rejects malformed dates, negative values and invalid schedules", () => {
    const scenario = base();
    scenario.reference.asOfDate = "2026-02-30";
    scenario.adjustments = [{ id: "bad", label: "Bad", kind: "expense", operation: "add", direction: "out", amount: -1, schedule: { kind: "monthly", firstDate: "2026-10-01", dayOfMonth: 0 }, provenance }];
    expect(validateWhatIfScenario(scenario)).toEqual(expect.arrayContaining([
      "reference.asOfDate must be a valid date",
      "adjustments[0].amount must be zero or more",
      "adjustments[0].schedule.dayOfMonth must be a whole number from 1 to 31",
    ]));
  });

  it("rejects a different engine version", () => {
    const scenario = base();
    scenario.engineVersion = 2;
    expect(validateWhatIfScenario(scenario)).toContain("engineVersion must be 1");
  });
});

describe("What-If baseline snapshot", () => {
  it("accepts an unknown liquid value while keeping the snapshot shape valid", () => {
    expect(validateWhatIfBaselineSnapshot({
      reference: { asOfDate: "2026-10-04", currency: "INR", timezone: "Asia/Calcutta", sourceVersions: [] },
      liquid: null,
      baseline: null,
      events: [],
    })).toEqual([]);
  });

  it("rejects invalid derived event values", () => {
    const errors = validateWhatIfBaselineSnapshot({
      reference: { asOfDate: "2026-10-04", currency: "INR", timezone: "Asia/Calcutta", sourceVersions: [] },
      liquid: 1000,
      baseline: null,
      events: [{ id: "event", label: "Event", source: "test", direction: "out", amount: -5, certainty: "assumed", schedule: { kind: "once", date: "2026-10-04" } }],
    });
    expect(errors).toContain("baseline.events[0].amount must be zero or more");
  });
});
