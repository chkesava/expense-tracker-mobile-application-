import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WHAT_IF_ENGINE_VERSION, WHAT_IF_LIMITS, type WhatIfScenarioDefinition } from "../types/whatIf";
import { markWhatIfScenarioCalculated, WHAT_IF_BASELINE_MODES, WHAT_IF_HISTORY_LIMIT, whatIfScenarioDoc } from "./whatIfScenarios";

const rules = readFileSync("firestore.rules", "utf8");
const body = rules.slice(rules.indexOf("function whatIfLastCalculatedWellFormed("), rules.indexOf("match /whatIfScenarios/"));
const scenarioFn = body.slice(body.indexOf("function whatIfScenarioWellFormed("));
const calcFn = body.slice(0, body.indexOf("function whatIfScenarioWellFormed("));
const quoted = (text: string, re: RegExp) => [...(text.match(re)?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);
const definition: WhatIfScenarioDefinition = { id: "s", name: "Scenario", version: 1, engineVersion: WHAT_IF_ENGINE_VERSION, reference: { asOfDate: "2026-10-04", currency: "INR", timezone: "Asia/Calcutta", sourceVersions: [] }, durationMonths: 12, adjustments: [], assumptions: [] };

describe("what-if scenario rules contract", () => {
  it("allows exactly the fields the builders write, with no id", () => {
    const full = markWhatIfScenarioCalculated(whatIfScenarioDoc({ scenario: definition, nowMs: 1 }), { mode: "saved", asOfDate: "2026-10-04" }, 2);
    expect(quoted(scenarioFn, /hasOnly\(\[([^\]]*)\]\)/).sort()).toEqual(Object.keys(full).sort());
    expect(quoted(scenarioFn, /hasOnly\(\[([^\]]*)\]\)/)).not.toContain("id");
    expect(quoted(scenarioFn, /hasAll\(\[([^\]]*)\]\)/).sort()).toEqual(Object.keys(full).filter((key) => key !== "lastCalculated").sort());
    expect(quoted(calcFn, /hasOnly\(\[([^\]]*)\]\)/).sort()).toEqual(Object.keys(full.lastCalculated!).sort());
  });

  it("matches the shared limits and modes and excludes calculated/ledger output", () => {
    expect(scenarioFn).toContain(`d.name.size() <= ${WHAT_IF_LIMITS.maxNameLength}`);
    expect(scenarioFn).toContain(`d.durationMonths <= ${WHAT_IF_LIMITS.maxProjectionMonths}`);
    expect(scenarioFn).toContain(`d.adjustments.size() <= ${WHAT_IF_LIMITS.maxAdjustments}`);
    expect(scenarioFn).toContain(`d.assumptions.size() <= ${WHAT_IF_LIMITS.maxAssumptions}`);
    expect(scenarioFn).toContain(`d.history.size() <= ${WHAT_IF_HISTORY_LIMIT}`);
    expect(scenarioFn).toContain(`d.engineVersion == ${WHAT_IF_ENGINE_VERSION}`);
    expect(quoted(calcFn, /c\.mode in \[([^\]]*)\]/)).toEqual([...WHAT_IF_BASELINE_MODES]);
    const allowed = quoted(scenarioFn, /hasOnly\(\[([^\]]*)\]\)/);
    for (const field of ["baseline", "events", "periods", "result", "liquid", "amount", "accountId"]) expect(allowed).not.toContain(field);
  });
});
