import { describe, expect, it } from "vitest";
import { WHAT_IF_ENGINE_VERSION, type WhatIfScenarioDefinition } from "../types/whatIf";
import { duplicateWhatIfScenarioDoc, editWhatIfScenarioDoc, sortWhatIfScenarios, validateWhatIfScenarioDoc, whatIfScenarioDoc } from "./whatIfScenarios";

const definition: WhatIfScenarioDefinition = {
  id: "raise",
  name: "Raise plan",
  version: 1,
  engineVersion: WHAT_IF_ENGINE_VERSION,
  reference: { asOfDate: "2026-10-04", currency: "INR", timezone: "Asia/Calcutta", sourceVersions: [{ source: "runway", version: "1" }] },
  durationMonths: 12,
  adjustments: [],
  assumptions: [],
};

describe("saved what-if scenarios", () => {
  it("creates a persistable definition with pinned creation metadata", () => {
    const saved = whatIfScenarioDoc({ scenario: definition, nowMs: 100 });
    expect(saved).toMatchObject({ id: "raise", version: 1, archived: false, createdAtMs: 100, updatedAtMs: 100 });
    expect(validateWhatIfScenarioDoc(saved)).toEqual([]);
  });

  it("edits assumptions without changing identity and increments version", () => {
    const saved = whatIfScenarioDoc({ scenario: definition, nowMs: 100 });
    const edited = editWhatIfScenarioDoc(saved, { ...definition, name: "Raise plus bonus" }, 200);
    expect(edited).toMatchObject({ id: "raise", name: "Raise plus bonus", version: 2, createdAtMs: 100, updatedAtMs: 200 });
  });

  it("duplicates independently and never carries archive state or version", () => {
    const source = { ...whatIfScenarioDoc({ scenario: definition, nowMs: 100 }), archived: true, version: 4 };
    const copy = duplicateWhatIfScenarioDoc(source, "Copy", 300);
    expect(copy).toMatchObject({ id: "raise-copy", name: "Copy", version: 1, archived: false, createdAtMs: 300 });
    expect(copy.adjustments).not.toBe(source.adjustments);
  });

  it("sorts active scenarios before archived, then newest first", () => {
    const make = (id: string, archived: boolean, updatedAtMs: number) => ({ ...whatIfScenarioDoc({ scenario: { ...definition, id }, nowMs: updatedAtMs }), archived, updatedAtMs });
    expect(sortWhatIfScenarios([make("old", false, 1), make("archived", true, 9), make("new", false, 10)]).map((x) => x.id)).toEqual(["new", "old", "archived"]);
  });

  it("rejects invalid timestamps and version metadata", () => {
    const saved = whatIfScenarioDoc({ scenario: definition, nowMs: 100 });
    expect(validateWhatIfScenarioDoc({ ...saved, createdAtMs: 200, updatedAtMs: 100 })).toContain("updatedAtMs must not precede createdAtMs");
    expect(validateWhatIfScenarioDoc({ ...saved, version: 0 })).toContain("version must be a positive whole number");
  });
});
