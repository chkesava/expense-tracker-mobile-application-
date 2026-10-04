import { describe, expect, it } from "vitest";

import type { MoneyDecision } from "../types/decision";
import { buildDecisionWrite, newDecisionDraft, transitionDecision } from "./decisionModel";
import {
  ASSESSMENT_LABELS,
  EMPTY_OUTCOME_DRAFT,
  VARIANCE_REASON_TEXT,
  canRecordOutcome,
  draftToOutcome,
  expectedForReview,
  outcomeToDraft,
  outcomeVariance,
  recordOutcome,
  reopenReview,
  varianceSentence,
} from "./decisionOutcome";

function decided(over: Partial<MoneyDecision> = {}): MoneyDecision {
  const base: MoneyDecision = {
    ...newDecisionDraft({ id: "d", title: "Prepay?", category: "loan_debt", nowMs: 1 }),
    expected: { summary: "Save interest", amount: 12000, unit: "inr" },
    revision: 1,
    ...over,
  };
  const r = transitionDecision(base, "decided", 10);
  if (!r.ok) throw new Error();
  return r.decision;
}

describe("expected side", () => {
  it("comes from the decide-time snapshot and flags later edits", () => {
    const d = { ...decided(), expected: { summary: "Save more", amount: 20000, unit: "inr" as const } };
    const e = expectedForReview(d);
    expect(e).toEqual({ expected: { summary: "Save interest", amount: 12000, unit: "inr" }, source: "snapshot", editedSinceDecided: true });
  });

  it("falls back to the live value before deciding, or none", () => {
    expect(expectedForReview({ expected: { summary: "x" } }).source).toBe("live");
    expect(expectedForReview({}).source).toBe("none");
  });

  it("is never overwritten by recording an outcome", () => {
    const d = decided();
    const r = recordOutcome(d, { recordedAtMs: 20, summary: "Saved 11k", amount: 11000, unit: "inr" }, true, 20);
    expect(r.ok && r.decision.expected).toEqual(d.expected);
    expect(r.ok && r.decision.decisionSnapshot).toEqual(d.decisionSnapshot);
  });
});

describe("variance", () => {
  const exp = { summary: "x", amount: 12000, unit: "inr" as const };

  it("is calculated only when both sides are amounts in the same unit", () => {
    expect(outcomeVariance(exp, { recordedAtMs: 1, summary: "y", amount: 11000, unit: "inr" })).toEqual({ ok: true, expected: 12000, actual: 11000, delta: -1000, pct: -8.3, unit: "inr" });
    expect(outcomeVariance({ summary: "x" }, { recordedAtMs: 1, summary: "y", amount: 5 })).toEqual({ ok: false, reason: "no_expected_amount" });
    expect(outcomeVariance(exp, { recordedAtMs: 1, summary: "y" })).toEqual({ ok: false, reason: "no_actual_amount" });
    expect(outcomeVariance(exp, undefined)).toEqual({ ok: false, reason: "no_actual_amount" });
    expect(outcomeVariance(exp, { recordedAtMs: 1, summary: "y", amount: 5, unit: "months" })).toEqual({ ok: false, reason: "different_units" });
    expect(outcomeVariance({ summary: "x", amount: 0 }, { recordedAtMs: 1, summary: "y", amount: 10 })).toMatchObject({ ok: true, pct: null });
  });

  it("is described neutrally and explains when it is missing", () => {
    const v = outcomeVariance(exp, { recordedAtMs: 1, summary: "y", amount: 13500, unit: "inr" });
    if (!v.ok) throw new Error();
    expect(varianceSentence(v, (n) => `₹${n}`)).toBe("₹1500 (12.5%) more than you expected.");
    expect(varianceSentence({ ...v, delta: 0, pct: 0 }, String)).toBe("Exactly as expected.");
    const text = Object.values(VARIANCE_REASON_TEXT).join(" ") + varianceSentence(v, String);
    for (const w of ["success", "fail", "good", "bad", "better", "worse"]) expect(text.toLowerCase()).not.toContain(w);
  });
});

describe("recording outcomes", () => {
  it("accepts a qualitative outcome with no numbers", () => {
    const r = draftToOutcome({ ...EMPTY_OUTCOME_DRAFT, summary: "Glad I waited", lessons: " Wait for sales " }, 5);
    expect(r).toEqual({ ok: true, outcome: { recordedAtMs: 5, summary: "Glad I waited", lessons: "Wait for sales" } });
  });

  it("accepts amounts (including negative) with the expected unit, a date, an assessment and notes", () => {
    const r = draftToOutcome({ summary: "Lost a bit", amount: "-1,500.50", outcomeDate: "2027-03-31", userAssessment: "mixed", lessons: "", reviewNotes: "Rates rose" }, 5);
    expect(r).toEqual({ ok: true, outcome: { recordedAtMs: 5, summary: "Lost a bit", amount: -1500.5, unit: "inr", outcomeDate: "2027-03-31", userAssessment: "mixed", reviewNotes: "Rates rose" } });
  });

  it("requires a summary and valid values", () => {
    expect(draftToOutcome({ ...EMPTY_OUTCOME_DRAFT, amount: "12k", outcomeDate: "2027-02-30" }, 1)).toEqual({ ok: false, issues: ["summary_required", "invalid_amount", "invalid_date"] });
  });

  it("round-trips through the draft", () => {
    const o = { recordedAtMs: 1, summary: "s", amount: 10, unit: "inr" as const, outcomeDate: "2027-01-01", userAssessment: "unsure" as const, lessons: "l", reviewNotes: "n" };
    const back = draftToOutcome(outcomeToDraft(o), 1);
    expect(back.ok && back.outcome).toEqual(o);
  });

  it("only offers the user's own assessment — never an automatic verdict", () => {
    expect(Object.keys(ASSESSMENT_LABELS)).toEqual(["better", "as_expected", "worse", "mixed", "unsure"]);
    const r = draftToOutcome({ ...EMPTY_OUTCOME_DRAFT, summary: "x", amount: "1" }, 1);
    expect(r.ok && r.outcome.userAssessment).toBeUndefined();
  });
});

describe("review lifecycle", () => {
  it("completes, reopens and closes — and each step is an audited write", () => {
    const d = decided();
    expect(canRecordOutcome(d)).toBe(true);
    expect(canRecordOutcome({ status: "draft" })).toBe(false);

    const done = recordOutcome(d, { recordedAtMs: 20, summary: "ok" }, true, 20);
    if (!done.ok) throw new Error();
    expect(done.decision.status).toBe("reviewed");
    const w1 = buildDecisionWrite(d, done.decision, 20);
    expect(w1.ok && w1.event).toMatchObject({ action: "status", fromStatus: "decided", toStatus: "reviewed", changedFields: ["outcome", "status"] });

    const reopened = reopenReview(done.decision, 30);
    expect(reopened.ok && reopened.decision.status).toBe("tracking");
    expect(reopened.ok && reopened.decision.outcome?.summary).toBe("ok");

    const closed = transitionDecision(done.decision, "closed", 40);
    if (!closed.ok) throw new Error();
    const back = reopenReview(closed.decision, 50);
    expect(back.ok && back.decision.status).toBe("reviewed");
    expect(reopenReview(d, 1)).toEqual({ ok: false, issues: ["invalid_transition"] });
  });

  it("can update an outcome without changing status", () => {
    const done = recordOutcome(decided(), { recordedAtMs: 20, summary: "ok" }, true, 20);
    if (!done.ok) throw new Error();
    const edited = recordOutcome(done.decision, { recordedAtMs: 30, summary: "better than I thought" }, true, 30);
    expect(edited.ok && edited.decision.status).toBe("reviewed");
    const w = buildDecisionWrite(done.decision, (edited as { decision: MoneyDecision }).decision, 30);
    expect(w.ok && w.event).toMatchObject({ action: "update", changedFields: ["outcome"] });
  });

  it("can record an outcome without completing the review", () => {
    const r = recordOutcome(decided(), { recordedAtMs: 20, summary: "early signs" }, false, 20);
    expect(r.ok && r.decision.status).toBe("decided");
  });
});
