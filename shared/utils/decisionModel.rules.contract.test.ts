/**
 * Contract test: the enum lists and caps in `decisionWellFormed` /
 * `decisionEventWellFormed` (firestore.rules) must match the TS model, and
 * every field the builder writes must be in the rules' allowlist. Reads the
 * rules text; the emulator suite (firestore/decisions.rules.test.ts)
 * exercises the rules themselves.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DECISION_CATEGORIES,
  DECISION_EVENT_ACTIONS,
  DECISION_LIMITS,
  DECISION_STATUSES,
  type MoneyDecision,
} from "../types/decision";
import { buildDecisionWrite, newDecisionDraft, transitionDecision } from "./decisionModel";

const RULES = readFileSync("firestore.rules", "utf8");

function ruleList(fn: string): string[] {
  const match = RULES.match(new RegExp(`function ${fn}\\(\\) \\{\\s*return \\[([^\\]]*)\\];`));
  if (!match) throw new Error(`function ${fn}() not found`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function allowlist(fn: string): Set<string> {
  const body = RULES.slice(RULES.indexOf(`function ${fn}(`));
  const m = body.match(/keys\(\)\.hasOnly\(\[([^\]]*)\]\)/);
  return new Set([...(m?.[1] ?? "").matchAll(/'([^']+)'/g)].map((x) => x[1]));
}

function fullDecision(): MoneyDecision {
  const d: MoneyDecision = {
    ...newDecisionDraft({ id: "d1", title: "Prepay the car loan?", category: "loan_debt", nowMs: 1, templateId: "loan_debt", templateVersion: 1 }),
    context: { situation: "Bonus arrived", goal: "Be debt free", constraints: ["Keep 3 months buffer"] },
    alternatives: [
      { id: "a", title: "Prepay", notes: "n", pros: ["less interest"], cons: ["less cash"], inputs: [{ id: "i", label: "Prepayment", amount: 100000, direction: "cost", frequency: "one_time", kind: "user_input" }], nonFinancial: "peace of mind" },
      { id: "b", title: "Invest", pros: [], cons: [], inputs: [] },
    ],
    selectedAlternativeId: "a",
    assumptions: [{ id: "s", text: "Rate stays", value: 9, unit: "percent", source: "user" }],
    rationale: "r",
    confidence: 3,
    expected: { summary: "Save interest", amount: 12000, unit: "inr", byDate: "2027-09-30" },
    outcome: { recordedAtMs: 5, summary: "Saved", amount: 11000, unit: "inr", outcomeDate: "2027-09-30", userAssessment: "as_expected", lessons: "l" },
    links: [{ id: "L", kind: "borrowing", refId: "b1", capturedLabel: "Car loan", capturedAmount: 400000, capturedAtMs: 1 }],
    commitments: [{ id: "c", text: "Call bank", targetDate: "2026-10-05", status: "done", completedAtMs: 4 }],
    reviewDate: "2027-03-31",
  };
  const r = transitionDecision(d, "decided", 2);
  if (!r.ok) throw new Error(r.issues.join());
  const closed = [r.decision].map((x) => ({ ...x, status: "closed" as const, closedAtMs: 3 }))[0];
  return { ...closed, status: "archived", archivedFromStatus: "closed" };
}

describe("decision rules ↔ TS model", () => {
  it("allow exactly the TS categories and statuses", () => {
    expect(ruleList("decisionCategories")).toEqual([...DECISION_CATEGORIES]);
    expect(ruleList("decisionStatuses")).toEqual([...DECISION_STATUSES]);
  });

  it("allow exactly the TS event actions", () => {
    expect(RULES).toContain(`d.action in [${DECISION_EVENT_ACTIONS.map((a) => `'${a}'`).join(", ")}]`);
  });

  it("use the same caps as the builder", () => {
    const L = DECISION_LIMITS;
    expect(RULES).toContain(`d.title.size() <= ${L.title}`);
    expect(RULES).toContain(`d.alternatives.size() <= ${L.alternatives}`);
    expect(RULES).toContain(`d.assumptions.size() <= ${L.assumptions}`);
    expect(RULES).toContain(`d.links.size() <= ${L.links}`);
    expect(RULES).toContain(`d.commitments.size() <= ${L.commitments}`);
    expect(RULES).toContain(`d.context.constraints.size() <= ${L.listItems}`);
    expect(RULES).toContain(`optionalText(d, 'rationale', ${L.text})`);
    expect(RULES).toContain(`d.changedFields.size() <= ${L.changedFields}`);
  });

  it("allow every field a fully populated decision writes, and no money fields", () => {
    const out = buildDecisionWrite(null, fullDecision(), 10);
    if (!out.ok) throw new Error(out.issues.join());
    const allowed = allowlist("decisionWellFormed");
    for (const key of Object.keys(out.data)) expect(allowed.has(key)).toBe(true);
    expect(allowed.has("amount")).toBe(false);
    expect(allowed.has("date")).toBe(false);
    const eventAllowed = allowlist("decisionEventWellFormed");
    for (const key of Object.keys(out.event)) expect(eventAllowed.has(key)).toBe(true);
  });
});
