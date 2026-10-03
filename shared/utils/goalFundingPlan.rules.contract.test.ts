import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { GOAL_FUNDING_MODES } from "../types/goalFunding";
import { GOAL_FUNDING_LIMITS } from "./goalFundingModel";
import { PLAN_NAME_MAX, goalFundingPlanDoc } from "./goalFundingPlans";

/** SPENDLY-220 — the plan document and firestore.rules must agree. */
const rules = readFileSync("firestore.rules", "utf8");
const body = rules.slice(rules.indexOf("function goalFundingPlanWellFormed("), rules.indexOf("match /goalFundingPlans/"));
const quoted = (re: RegExp) => [...(body.match(re)?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);

describe("goal funding plan rules contract", () => {
  it("allows exactly the fields the app writes", () => {
    const full = goalFundingPlanDoc({ name: "n", mode: "balanced", plannedMonthly: 1, allowOverAllocation: false, inputs: [], goals: [], nowMs: 1 });
    expect(quoted(/hasOnly\(\[([^\]]*)\]\)/).sort()).toEqual(Object.keys(full).sort());
  });

  it("matches modes and limits", () => {
    expect(quoted(/d\.mode in \[([^\]]*)\]/)).toEqual([...GOAL_FUNDING_MODES]);
    expect(body).toContain(`d.name.size() <= ${PLAN_NAME_MAX}`);
    expect(body).toContain(`d.inputs.size() <= ${GOAL_FUNDING_LIMITS.maxGoals}`);
    expect(body).toContain(`d.goalSnapshot.size() <= ${GOAL_FUNDING_LIMITS.maxGoals}`);
  });

  it("never allows ledger-shaped fields", () => {
    const allowed = quoted(/hasOnly\(\[([^\]]*)\]\)/);
    for (const f of ["amount", "date", "accountId", "currentAmount", "targetAmount"]) expect(allowed).not.toContain(f);
  });
});
