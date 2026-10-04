import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WHAT_IF_ENGINE_VERSION, WHAT_IF_LIMITS, type WhatIfScenarioDefinition } from "../types/whatIf";
import { whatIfScenarioDoc } from "./whatIfScenarios";

const rules = readFileSync("firestore.rules", "utf8");
const body = rules.slice(rules.indexOf("function whatIfScenarioWellFormed("), rules.indexOf("match /whatIfScenarios/"));
const quoted = (re: RegExp) => [...(body.match(re)?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);
const definition: WhatIfScenarioDefinition = { id: "s", name: "Scenario", version: 1, engineVersion: WHAT_IF_ENGINE_VERSION, reference: { asOfDate: "2026-10-04", currency: "INR", timezone: "Asia/Calcutta", sourceVersions: [] }, durationMonths: 12, adjustments: [], assumptions: [] };

describe("what-if scenario rules contract", () => {
  it("allows exactly the fields the document builder writes", () => {
    const full = whatIfScenarioDoc({ scenario: definition, nowMs: 1 });
    expect(quoted(/hasOnly\(\[([^\]]*)\]\)/).sort()).toEqual(Object.keys(full).filter((key) => key !== "id").sort());
  });

  it("matches the shared limits and excludes calculated/ledger output", () => {
    expect(body).toContain(`d.name.size() <= ${WHAT_IF_LIMITS.maxNameLength}`);
    expect(body).toContain(`d.durationMonths <= ${WHAT_IF_LIMITS.maxProjectionMonths}`);
    expect(body).toContain(`d.adjustments.size() <= ${WHAT_IF_LIMITS.maxAdjustments}`);
    expect(body).toContain(`d.assumptions.size() <= ${WHAT_IF_LIMITS.maxAssumptions}`);
    const allowed = quoted(/hasOnly\(\[([^\]]*)\]\)/);
    for (const field of ["baseline", "events", "periods", "result", "liquid", "amount", "accountId"]) expect(allowed).not.toContain(field);
  });
});
