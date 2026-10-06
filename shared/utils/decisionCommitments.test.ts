import { describe, expect, it } from "vitest";

import type { DecisionCommitment, MoneyDecision } from "../types/decision";
import {
  ACTIONS_ARE_NOT_OUTCOMES,
  addCommitment,
  commitmentProgress,
  commitmentState,
  dueStateFor,
  followUps,
  removeCommitment,
  reviewState,
  setCommitmentStatus,
  setReviewDate,
  validateCommitmentDraft,
} from "./decisionCommitments";
import { buildDecisionWrite, newDecisionDraft, validateDecision } from "./decisionModel";
import { decisionEvents } from "./calendarSources";

const TODAY = "2026-10-02";
const c = (id: string, over: Partial<DecisionCommitment> = {}): DecisionCommitment => ({ id, text: `Do ${id}`, status: "open", ...over });
const dec = (id: string, over: Partial<MoneyDecision> = {}): MoneyDecision => ({ ...newDecisionDraft({ id, title: `Decision ${id}`, category: "loan_debt", nowMs: 1 }), ...over });

describe("due states", () => {
  it("classify dates against today", () => {
    expect(dueStateFor("2026-10-01", TODAY)).toBe("overdue");
    expect(dueStateFor("2026-10-02", TODAY)).toBe("due_today");
    expect(dueStateFor("2026-10-09", TODAY)).toBe("upcoming");
    expect(dueStateFor("2026-10-10", TODAY)).toBe("later");
    expect(dueStateFor(undefined, TODAY)).toBe("no_date");
  });

  it("put done and dropped above any date", () => {
    expect(commitmentState(c("a", { status: "done", targetDate: "2026-01-01" }), TODAY)).toBe("done");
    expect(commitmentState(c("a", { status: "dropped", targetDate: "2026-01-01" }), TODAY)).toBe("dropped");
    expect(commitmentState(c("a", { targetDate: "2026-01-01" }), TODAY)).toBe("overdue");
  });

  it("only make a review due while the decision is decided or tracked", () => {
    expect(reviewState({ status: "decided", reviewDate: "2026-09-01" }, TODAY)).toBe("overdue");
    expect(reviewState({ status: "tracking", reviewDate: "2026-10-05" }, TODAY)).toBe("upcoming");
    expect(reviewState({ status: "reviewed", reviewDate: "2026-09-01" }, TODAY)).toBe("reviewed");
    expect(reviewState({ status: "draft", reviewDate: "2026-09-01" }, TODAY)).toBe("not_applicable");
    expect(reviewState({ status: "decided" }, TODAY)).toBe("no_date");
  });
});

describe("progress is about actions, not outcomes", () => {
  it("counts actions and always carries the caveat", () => {
    const p = commitmentProgress([c("a", { status: "done" }), c("b", { targetDate: "2026-09-01" }), c("c", { status: "dropped" }), c("d")], TODAY);
    expect(p).toEqual({ total: 4, done: 1, dropped: 1, open: 2, overdue: 1, caveat: ACTIONS_ARE_NOT_OUTCOMES });
    expect(ACTIONS_ARE_NOT_OUTCOMES).toMatch(/not how the decision turned out/);
  });

  it("completing every action does not touch the outcome or status", () => {
    let d = dec("x", { status: "tracking", commitments: [c("a"), c("b")] });
    d = setCommitmentStatus(setCommitmentStatus(d, "a", "done", 5), "b", "done", 6);
    expect(d.outcome).toBeUndefined();
    expect(d.status).toBe("tracking");
  });
});

describe("editing commitments", () => {
  it("adds, completes, reopens and removes — and stays a valid, audited decision", () => {
    let d = addCommitment(dec("x"), { id: "a", text: " Call the bank ", owner: " Me ", targetDate: "2026-10-05" });
    expect(d.commitments[0]).toEqual({ id: "a", text: "Call the bank", owner: "Me", targetDate: "2026-10-05", status: "open" });
    d = setCommitmentStatus(d, "a", "done", 50);
    expect(d.commitments[0]).toMatchObject({ status: "done", completedAtMs: 50 });
    d = setCommitmentStatus(d, "a", "open", 60);
    expect(d.commitments[0].completedAtMs).toBeUndefined();
    expect(validateDecision(d)).toEqual([]);
    const w = buildDecisionWrite(dec("x"), d, 70);
    expect(w.ok && w.event.changedFields).toEqual(["commitments"]);
    expect(removeCommitment(d, "a").commitments).toEqual([]);
  });

  it("sets and clears the review date", () => {
    expect(setReviewDate(dec("x"), "2027-01-01").reviewDate).toBe("2027-01-01");
    expect(setReviewDate(dec("x", { reviewDate: "2027-01-01" }), null).reviewDate).toBeUndefined();
  });

  it("validates drafts", () => {
    expect(validateCommitmentDraft({ text: "" }, 0)).toEqual(["text_required"]);
    expect(validateCommitmentDraft({ text: "x", targetDate: "2026-02-30" }, 0)).toEqual(["invalid_date"]);
    expect(validateCommitmentDraft({ text: "x", owner: "o".repeat(61) }, 0)).toEqual(["owner_too_long"]);
    expect(validateCommitmentDraft({ text: "x" }, 30)).toEqual(["too_many"]);
    expect(validateDecision(dec("x", { commitments: [c("a", { text: " " })] }))).toContain("text_too_long");
  });
});

describe("follow-ups and calendar events", () => {
  const decisions = [
    dec("a", { status: "decided", reviewDate: "2026-09-30", commitments: [c("1", { targetDate: "2026-10-04" }), c("2", { status: "done", targetDate: "2026-09-01" })] }),
    dec("b", { status: "tracking", reviewDate: "2026-12-01", commitments: [c("3", { targetDate: "2026-10-02" })] }),
    dec("c", { status: "archived", reviewDate: "2026-09-01", commitments: [c("4", { targetDate: "2026-09-01" })] }),
    dec("d", { status: "draft", commitments: [c("5")] }),
  ];

  it("lists what needs attention, most urgent first, skipping archived and done", () => {
    expect(followUps(decisions, TODAY).map((f) => `${f.key}=${f.state}`)).toEqual(["a:review=overdue", "b:3=due_today", "a:1=upcoming"]);
  });

  it("produces calendar events only for real dates on live decisions", () => {
    const ctx = { range: { from: "2026-09-01", to: "2026-12-31" }, today: TODAY, currency: "INR" };
    const events = decisionEvents(decisions, ctx);
    
    // Sort events exactly as they were returned before to match expectations
    const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    
    expect(sorted.map((e) => e.refId)).toEqual(["a:review", "b:3", "a:1", "b:review"]);
    expect(sorted.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.href?.startsWith("/decisions/"))).toBe(true);
  });
});
