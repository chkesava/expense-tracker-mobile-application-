import { describe, expect, it } from "vitest";

import { DECISION_CATEGORIES } from "../types/decision";
import {
  DECISION_TEMPLATES,
  DECISION_TEMPLATE_IDS,
  allDecisionTemplateVersions,
  getDecisionTemplate,
  isDecisionTemplateId,
} from "./decisionTemplates";

describe("decision templates", () => {
  it("cover every template in the SPENDLY-364 scope", () => {
    expect(DECISION_TEMPLATES.map((t) => t.id)).toEqual([...DECISION_TEMPLATE_IDS]);
    expect([...DECISION_TEMPLATE_IDS]).toEqual(["purchase", "loan_debt", "savings_goal", "investment", "insurance", "subscription", "income", "custom"]);
  });

  it("map to real categories and fit the rules' 40-char id cap", () => {
    for (const t of allDecisionTemplateVersions()) {
      expect(DECISION_CATEGORIES).toContain(t.category);
      expect(t.id.length).toBeLessThanOrEqual(40);
      expect(Number.isInteger(t.version) && t.version >= 1).toBe(true);
    }
  });

  it("never publish the same id + version twice", () => {
    const keys = allDecisionTemplateVersions().map((t) => `${t.id}@${t.version}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keep suggestions short enough to save", () => {
    for (const t of allDecisionTemplateVersions()) {
      for (const s of [...t.suggestedConstraints, ...t.suggestedAssumptions]) expect(s.length).toBeLessThanOrEqual(2000);
      for (const s of t.suggestedOptions) expect(s.length).toBeLessThanOrEqual(120);
    }
  });

  it("resolve the exact stored version, and fall back safely", () => {
    expect(getDecisionTemplate("loan_debt", 1)).toMatchObject({ id: "loan_debt", version: 1 });
    expect(getDecisionTemplate("loan_debt", 99).id).toBe("loan_debt");
    expect(getDecisionTemplate("loan_debt").id).toBe("loan_debt");
    expect(getDecisionTemplate("made_up", 1).id).toBe("custom");
    expect(getDecisionTemplate(undefined).id).toBe("custom");
    expect(isDecisionTemplateId("insurance")).toBe(true);
  });

  it("give no product or investment advice", () => {
    const text = allDecisionTemplateVersions()
      .flatMap((t) => [t.description, ...Object.values(t.prompts), ...t.suggestedConstraints, ...t.suggestedAssumptions, ...t.suggestedOptions])
      .join(" ")
      .toLowerCase();
    for (const w of ["recommend", "best", "guaranteed", "you should"]) expect(text).not.toContain(w);
  });
});
