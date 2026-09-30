import { describe, expect, it } from "vitest";

import type { MoneyDecision } from "../types/decision";
import {
  decisionFormIssues,
  decisionStepIssues,
  decisionToForm,
  firstStepWithIssues,
  formToDecision,
  isDecisionFormDirty,
  moveItem,
  reviewDateChoices,
} from "./decisionForm";
import { buildDecisionWrite, newDecisionDraft, transitionDecision } from "./decisionModel";

const base = (over: Partial<MoneyDecision> = {}): MoneyDecision => ({
  ...newDecisionDraft({ id: "d1", title: "Buy a laptop?", category: "purchase", nowMs: 1 }),
  ...over,
});

describe("round trip", () => {
  it("form ↔ decision without losing fields the form does not show", () => {
    const d = base({
      alternatives: [{ id: "a", title: "MacBook", notes: "light", pros: ["battery"], cons: ["price"], inputs: [{ id: "i", label: "Price", amount: 120000, direction: "cost", frequency: "one_time", kind: "user_input" }], nonFinancial: "work" }],
      assumptions: [
        { id: "u", text: "Lasts 5 years", source: "user" },
        { id: "k", text: "Balance ₹2L", source: "linked", sourceLinkId: "L" },
      ],
      links: [{ id: "L", kind: "account", refId: "hdfc", capturedLabel: "HDFC", capturedAtMs: 1 }],
      commitments: [{ id: "c", text: "Sell old laptop", status: "open" }],
      outcome: { recordedAtMs: 5, summary: "ok" },
    });
    const form = decisionToForm(d);
    expect(form.assumptions).toEqual([{ id: "u", text: "Lasts 5 years" }]);
    const back = formToDecision(form, d);
    expect(back.alternatives[0]).toEqual(d.alternatives[0]);
    expect(back.assumptions).toEqual(d.assumptions);
    expect(back.commitments).toEqual(d.commitments);
    expect(back.outcome).toEqual(d.outcome);
    expect(buildDecisionWrite(d, back, 2).ok).toBe(true);
  });

  it("drops blank rows, trims text and clears emptied fields", () => {
    const form = { ...decisionToForm(base({ rationale: "old" })), rationale: "  ", constraints: [" budget ", ""], alternatives: [{ id: "a", title: " A ", notes: "" }, { id: "b", title: "", notes: "" }] };
    const d = formToDecision(form, base({ rationale: "old" }));
    expect(d.rationale).toBeUndefined();
    expect(d.context.constraints).toEqual(["budget"]);
    expect(d.alternatives.map((a) => a.title)).toEqual(["A"]);
    expect(d.alternatives[0].notes).toBeUndefined();
  });

  it("keeps a selection only if that option still exists", () => {
    const form = { ...decisionToForm(base()), alternatives: [{ id: "a", title: "A", notes: "" }], selectedAlternativeId: "gone" };
    expect(formToDecision(form, base()).selectedAlternativeId).toBeUndefined();
    expect(formToDecision({ ...form, selectedAlternativeId: "a" }, base()).selectedAlternativeId).toBe("a");
  });

  it("records the expected amount as a user-entered rupee figure", () => {
    const form = { ...decisionToForm(base()), expectedSummary: "Save on repairs", expectedAmount: "12,000", expectedByDate: "2027-09-30" };
    expect(formToDecision(form, base()).expected).toEqual({ summary: "Save on repairs", amount: 12000, unit: "inr", byDate: "2027-09-30" });
    expect(formToDecision({ ...form, expectedSummary: "", expectedAmount: "", expectedByDate: "" }, base()).expected).toBeUndefined();
  });

  it("does not touch the frozen snapshot when editing a decided decision", () => {
    const decided = transitionDecision(base({ alternatives: [{ id: "a", title: "A", pros: [], cons: [], inputs: [] }], selectedAlternativeId: "a" }), "decided", 9);
    if (!decided.ok) throw new Error();
    const edited = formToDecision({ ...decisionToForm(decided.decision), title: "Buy a laptop now?" }, decided.decision);
    expect(edited.decisionSnapshot).toEqual(decided.decision.decisionSnapshot);
  });
});

describe("validation", () => {
  const form = decisionToForm(base());

  it("requires only a title", () => {
    expect(decisionFormIssues(form)).toEqual([]);
    expect(decisionStepIssues({ ...form, title: " " }, "question")[0].field).toBe("title");
    expect(firstStepWithIssues({ ...form, title: "" })).toBe("question");
  });

  it("asks to name or remove blank options", () => {
    const issues = decisionStepIssues({ ...form, alternatives: [{ id: "a", title: "", notes: "" }] }, "options");
    expect(issues[0].message).toMatch(/Name option 1, or remove it/);
    expect(firstStepWithIssues({ ...form, alternatives: [{ id: "a", title: "", notes: "" }] })).toBe("options");
  });

  it("checks amounts and dates", () => {
    expect(decisionStepIssues({ ...form, expectedAmount: "12k" }, "expected")[0].field).toBe("expectedAmount");
    expect(decisionStepIssues({ ...form, reviewDate: "2027-02-30" }, "expected")[0].field).toBe("reviewDate");
    expect(decisionStepIssues({ ...form, reviewDate: "2027-02-28" }, "expected")).toEqual([]);
  });

  it("flags a pick that was removed", () => {
    expect(decisionStepIssues({ ...form, selectedAlternativeId: "x" }, "choice")[0].field).toBe("selected");
  });
});

describe("helpers", () => {
  it("reorders options", () => {
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });

  it("offers review dates from today", () => {
    expect(reviewDateChoices("2026-09-30").map((c) => c.date)).toEqual(["2026-10-30", "2026-12-30", "2027-03-31", "2027-09-30"]);
  });

  it("detects unsaved changes", () => {
    const f = decisionToForm(base());
    expect(isDecisionFormDirty(f, f)).toBe(false);
    expect(isDecisionFormDirty({ ...f, goal: "x" }, f)).toBe(true);
  });
});
