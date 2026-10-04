import { describe, expect, it } from "vitest";

import type { DecisionAlternative, MoneyDecision } from "../types/decision";
import { DECISION_STATUSES } from "../types/decision";
import {
  buildDecisionWrite,
  canTransitionDecision,
  decisionCategoryLabel,
  decisionStatusLabel,
  deletionEvent,
  newDecisionDraft,
  sortDecisionsForList,
  transitionDecision,
  validateDecision,
} from "./decisionModel";

const alt = (id: string, title = `Option ${id}`): DecisionAlternative => ({
  id,
  title,
  pros: [],
  cons: [],
  inputs: [{ id: `${id}-cost`, label: "Price", amount: 1000, direction: "cost", frequency: "one_time", kind: "user_input" }],
});

function draft(over: Partial<MoneyDecision> = {}): MoneyDecision {
  return { ...newDecisionDraft({ id: "d1", title: "Buy a laptop?", category: "purchase", nowMs: 100 }), ...over };
}

function decided(): MoneyDecision {
  const d = draft({ alternatives: [alt("a"), alt("b")], selectedAlternativeId: "a", rationale: "Lasts longer" });
  const r = transitionDecision(d, "decided", 200);
  if (!r.ok) throw new Error(r.issues.join());
  return r.decision;
}

describe("drafts", () => {
  it("need only a title and category", () => {
    expect(validateDecision(draft())).toEqual([]);
    expect(validateDecision(draft({ title: "  " }))).toContain("title_required");
    expect(validateDecision(draft({ title: "x".repeat(141) }))).toContain("title_too_long");
    expect(validateDecision(draft({ category: "crypto" as never }))).toContain("unknown_category");
  });

  it("start with empty reasoning and no money fields", () => {
    const d = draft();
    expect(d).toMatchObject({ status: "draft", alternatives: [], assumptions: [], links: [], commitments: [], revision: 0 });
    expect(d).not.toHaveProperty("amount");
    expect(d).not.toHaveProperty("date");
  });
});

describe("lifecycle", () => {
  it("supports every state", () => {
    const path = ["considering", "decided", "tracking", "reviewed", "closed", "archived"] as const;
    let d = draft({ alternatives: [alt("a")], selectedAlternativeId: "a" });
    const seen = new Set<string>([d.status]);
    for (const to of path) {
      const r = transitionDecision(d, to, 300);
      expect(r.ok).toBe(true);
      if (r.ok) d = r.decision;
      seen.add(d.status);
    }
    expect([...seen].sort()).toEqual([...DECISION_STATUSES].sort());
  });

  it("refuses skipped or backwards moves except explicit reopen paths", () => {
    expect(canTransitionDecision({ status: "draft" }, "reviewed")).toBe(false);
    expect(canTransitionDecision({ status: "decided" }, "draft")).toBe(false);
    expect(canTransitionDecision({ status: "reviewed" }, "tracking")).toBe(true);
    expect(canTransitionDecision({ status: "closed" }, "reviewed")).toBe(true);
    expect(canTransitionDecision({ status: "closed" }, "closed")).toBe(false);
    expect(transitionDecision(draft(), "closed", 1)).toEqual({ ok: false, issues: ["invalid_transition"] });
  });

  it("archives from anywhere and restores to where it was", () => {
    const d = decided();
    const archived = transitionDecision(d, "archived", 400);
    expect(archived.ok && archived.decision.archivedFromStatus).toBe("decided");
    if (!archived.ok) return;
    expect(canTransitionDecision(archived.decision, "tracking")).toBe(false);
    const restored = transitionDecision(archived.decision, "decided", 500);
    expect(restored.ok && restored.decision.status).toBe("decided");
    expect(restored.ok && restored.decision.archivedFromStatus).toBeUndefined();
  });

  it("requires a chosen option before deciding", () => {
    const d = draft({ alternatives: [alt("a"), alt("b")] });
    expect(transitionDecision(d, "decided", 1)).toEqual({ ok: false, issues: ["selection_missing"] });
    expect(transitionDecision({ ...d, selectedAlternativeId: "zzz" }, "decided", 1)).toEqual({ ok: false, issues: ["selection_unknown"] });
    // A plain yes/no decision with no listed options may be decided.
    expect(transitionDecision(draft(), "decided", 1).ok).toBe(true);
  });

  it("stamps close time and clears it on reopen", () => {
    let d = decided();
    for (const to of ["reviewed", "closed"] as const) {
      const r = transitionDecision(d, to, 900);
      if (r.ok) d = r.decision;
    }
    expect(d.closedAtMs).toBe(900);
    const reopened = transitionDecision(d, "reviewed", 950);
    expect(reopened.ok && reopened.decision.closedAtMs).toBeUndefined();
  });
});

describe("frozen snapshot", () => {
  it("captures the reasoning at the moment of deciding", () => {
    const d = decided();
    expect(d.decidedAtMs).toBe(200);
    expect(d.decisionSnapshot).toMatchObject({ frozenAtMs: 200, selectedAlternativeId: "a", rationale: "Lasts longer" });
    expect(d.decisionSnapshot?.alternatives).toHaveLength(2);
  });

  it("does not change when live fields are edited or the decision is reopened", () => {
    const d = decided();
    const before = JSON.stringify(d.decisionSnapshot);
    d.alternatives[0].title = "Changed later";
    d.alternatives[0].inputs[0].amount = 99999;
    expect(JSON.stringify(d.decisionSnapshot)).toBe(before);

    let cur = d;
    for (const to of ["reviewed", "tracking", "reviewed"] as const) {
      const r = transitionDecision(cur, to, 1000);
      if (r.ok) cur = r.decision;
    }
    expect(JSON.stringify(cur.decisionSnapshot)).toBe(before);
  });

  it("survives a write that tries to replace it", () => {
    const prev = decided();
    const tampered = { ...prev, decisionSnapshot: { ...prev.decisionSnapshot!, rationale: "rewritten" }, decidedAtMs: 1 };
    const out = buildDecisionWrite(prev, tampered, 300);
    expect(out.ok && out.data.decisionSnapshot?.rationale).toBe("Lasts longer");
    expect(out.ok && out.data.decidedAtMs).toBe(200);
  });

  it("is required once decided", () => {
    const d = decided();
    expect(validateDecision({ ...d, decisionSnapshot: undefined })).toContain("snapshot_missing");
  });
});

describe("separation and provenance", () => {
  it("keeps assumptions traceable to their source", () => {
    const base = draft({ links: [{ id: "L1", kind: "account", refId: "hdfc", capturedLabel: "HDFC ••1234", capturedAtMs: 1 }] });
    expect(validateDecision({ ...base, assumptions: [{ id: "s1", text: "Balance covers it", source: "linked", sourceLinkId: "L1" }] })).toEqual([]);
    expect(validateDecision({ ...base, assumptions: [{ id: "s1", text: "x", source: "linked", sourceLinkId: "nope" }] })).toContain("assumption_source_missing");
    expect(validateDecision({ ...base, assumptions: [{ id: "s1", text: "x", source: "derived", value: 12 }] })).toContain("assumption_source_missing");
    expect(validateDecision({ ...base, assumptions: [{ id: "s1", text: "x", source: "derived", value: 12, derivation: "1000 × 12 months" }] })).toEqual([]);
  });

  it("keeps links as references", () => {
    expect(validateDecision(draft({ links: [{ id: "L", kind: "transaction", refId: "e1", capturedLabel: "Laptop", capturedAtMs: 1 }] }))).toContain("link_ref_missing");
    expect(validateDecision(draft({ links: [{ id: "L", kind: "account", refId: "", capturedLabel: "x", capturedAtMs: 1 }] }))).toContain("link_ref_missing");
    expect(validateDecision(draft({ links: [{ id: "L", kind: "transaction", refId: "e1", refKind: "expense", capturedLabel: "Laptop", capturedAmount: 75000, capturedAtMs: 1 }] }))).toEqual([]);
  });

  it("keeps expected and actual as separate records", () => {
    const d = draft({ expected: { summary: "Save ₹2,000 a month", amount: 2000, unit: "inr" }, outcome: { recordedAtMs: 5, summary: "Saved ₹1,500", amount: 1500, unit: "inr" } });
    expect(validateDecision(d)).toEqual([]);
    expect(d.expected).not.toBe(d.outcome);
  });

  it("rejects bad numbers, dates, confidence and duplicate ids", () => {
    expect(validateDecision(draft({ alternatives: [{ ...alt("a"), inputs: [{ ...alt("a").inputs[0], amount: -5 }] }] }))).toContain("invalid_amount");
    expect(validateDecision(draft({ expected: { summary: "x", amount: Number.NaN } }))).toContain("invalid_amount");
    expect(validateDecision(draft({ reviewDate: "30/09/2026" }))).toContain("invalid_date");
    expect(validateDecision(draft({ confidence: 6 }))).toContain("invalid_confidence");
    expect(validateDecision(draft({ alternatives: [alt("a"), alt("a")] }))).toContain("duplicate_id");
  });

  it("caps sizes", () => {
    expect(validateDecision(draft({ alternatives: Array.from({ length: 21 }, (_, i) => alt(`a${i}`)) }))).toContain("too_many_items");
    expect(validateDecision(draft({ rationale: "x".repeat(2001) }))).toContain("text_too_long");
  });
});

describe("buildDecisionWrite", () => {
  it("creates revision 1 with a create event that carries no content", () => {
    const out = buildDecisionWrite(null, draft({ rationale: "private reason" }), 100);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.data.revision).toBe(1);
    expect(out.data).not.toHaveProperty("id");
    expect(out.event).toEqual({ decisionId: "d1", action: "create", toStatus: "draft", changedFields: [], revision: 1, atMs: 100 });
    expect(JSON.stringify(out.event)).not.toContain("private");
  });

  it("advances the revision, pins creation time and lists changed fields", () => {
    const first = buildDecisionWrite(null, draft(), 100);
    if (!first.ok) throw new Error();
    const prev: MoneyDecision = { ...first.data, id: "d1" };
    const out = buildDecisionWrite(prev, { ...prev, rationale: "because", createdAtMs: 1, confidence: 4 }, 200);
    expect(out.ok && out.data.revision).toBe(2);
    expect(out.ok && out.data.createdAtMs).toBe(100);
    expect(out.ok && out.event).toMatchObject({ action: "update", changedFields: ["confidence", "rationale"], revision: 2 });
  });

  it("records status changes", () => {
    const first = buildDecisionWrite(null, draft(), 100);
    if (!first.ok) throw new Error();
    const prev: MoneyDecision = { ...first.data, id: "d1" };
    const moved = transitionDecision(prev, "considering", 150);
    if (!moved.ok) throw new Error();
    const out = buildDecisionWrite(prev, moved.decision, 150);
    expect(out.ok && out.event).toMatchObject({ action: "status", fromStatus: "draft", toStatus: "considering", changedFields: ["status"] });
  });

  it("never writes undefined values", () => {
    const out = buildDecisionWrite(null, draft({ rationale: undefined, expected: { summary: "x", amount: undefined } }), 1);
    expect(out.ok && JSON.stringify(out.data)).not.toContain("undefined");
    expect(out.ok && "rationale" in out.data).toBe(false);
  });

  it("refuses an invalid decision", () => {
    expect(buildDecisionWrite(null, draft({ title: "" }), 1)).toEqual({ ok: false, issues: ["title_required"] });
  });

  it("builds a delete audit event", () => {
    expect(deletionEvent({ id: "d1", revision: 3, status: "closed" }, 9)).toEqual({ decisionId: "d1", action: "delete", fromStatus: "closed", changedFields: [], revision: 4, atMs: 9 });
  });
});

describe("labels", () => {
  it("labels every status and category", () => {
    expect(decisionStatusLabel("tracking")).toBe("Tracking");
    expect(decisionCategoryLabel("loan_debt")).toBe("Loan or debt");
  });
});

describe("sortDecisionsForList", () => {
  it("puts drafts first, archived last, newest touched first", () => {
    const mk = (id: string, status: MoneyDecision["status"], updatedAtMs: number) => ({ ...draft({ id, status }), updatedAtMs });
    const out = sortDecisionsForList([mk("a", "archived", 9), mk("b", "decided", 5), mk("c", "draft", 1), mk("d", "closed", 8), mk("e", "tracking", 7)]);
    expect(out.map((d) => d.id)).toEqual(["c", "e", "b", "d", "a"]);
  });
});
