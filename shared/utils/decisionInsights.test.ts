import { describe, expect, it } from "vitest";

import type { MoneyDecision } from "../types/decision";
import { MIN_FOR_PERCENT, buildDecisionInsights } from "./decisionInsights";
import { newDecisionDraft } from "./decisionModel";

const DAY = 86_400_000;
const T0 = Date.parse("2026-01-01T00:00:00Z");

function dec(id: string, over: Partial<MoneyDecision> = {}): MoneyDecision {
  return { ...newDecisionDraft({ id, title: `Decision ${id}`, category: "purchase", nowMs: T0 }), status: "decided", decidedAtMs: T0 + 2 * DAY, revision: 1, ...over };
}

function withOutcome(id: string, expected: number | undefined, actual: number | undefined, over: Partial<MoneyDecision> = {}): MoneyDecision {
  const exp = expected === undefined ? undefined : { summary: "e", amount: expected, unit: "inr" as const };
  return dec(id, {
    status: "reviewed",
    expected: exp,
    decisionSnapshot: { frozenAtMs: T0, revision: 1, alternatives: [], assumptions: [], links: [], ...(exp ? { expected: exp } : {}) },
    outcome: { recordedAtMs: T0 + 32 * DAY, summary: "a", ...(actual === undefined ? {} : { amount: actual, unit: "inr" as const }) },
    ...over,
  });
}

const kinds = (list: ReturnType<typeof buildDecisionInsights>) => list.map((i) => i.kind);

describe("buildDecisionInsights", () => {
  it("is empty with no decisions, and ignores drafts", () => {
    expect(buildDecisionInsights([])).toEqual([]);
    expect(buildDecisionInsights([dec("d", { status: "draft" })])).toEqual([]);
  });

  it("uses counts, not percentages, while history is small", () => {
    const list = buildDecisionInsights([dec("a"), withOutcome("b", 100, 90)]);
    const review = list.find((i) => i.kind === "review_completion")!;
    expect(review.title).toBe("You've looked back on 1 of 2 of the decisions you made");
    expect(review.basis).toMatch(/fewer than 5/);
    expect(kinds(list)).not.toContain("expected_vs_actual");
    expect(kinds(list)).not.toContain("time_to_decide");
  });

  it("switches to percentages once there is enough data", () => {
    const list = buildDecisionInsights([...Array.from({ length: 3 }, (_, i) => withOutcome(`r${i}`, 100, 100)), dec("x"), dec("y")]);
    expect(list.find((i) => i.kind === "review_completion")!.title).toBe("You've looked back on 60% of the decisions you made");
    expect(MIN_FOR_PERCENT).toBe(5);
  });

  it("groups by category and names a clear leader only", () => {
    const list = buildDecisionInsights([dec("a", { category: "loan_debt" }), dec("b", { category: "loan_debt" }), dec("c")]);
    const cat = list.find((i) => i.kind === "by_category")!;
    expect(cat.title).toBe("Most of your decisions are about loan or debt");
    expect(cat.decisionIds).toEqual(["a", "b"]);
    const tie = buildDecisionInsights([dec("a", { category: "loan_debt" }), dec("c")]).find((i) => i.kind === "by_category")!;
    expect(tie.title).toBe("Your decisions by category");
  });

  it("compares expected and actual only where comparable, without judging", () => {
    const list = buildDecisionInsights([withOutcome("a", 100, 120), withOutcome("b", 100, 80), withOutcome("c", 100, 100), withOutcome("d", undefined, 50), withOutcome("e", 100, undefined)]);
    const v = list.find((i) => i.kind === "expected_vs_actual")!;
    expect(v.decisionIds.sort()).toEqual(["a", "b", "c"]);
    expect(v.body).toBe("The actual amount was more than you expected 1 time, less 1 time, and the same 1 time.");
  });

  it("reports only the user's own assessments", () => {
    const list = buildDecisionInsights([withOutcome("a", 1, 1, { outcome: { recordedAtMs: T0, summary: "s", userAssessment: "mixed" } }), withOutcome("b", 1, 1)]);
    const a = list.find((i) => i.kind === "your_assessments")!;
    expect(a.body).toBe("Mixed: 1");
    expect(a.decisionIds).toEqual(["a"]);
    expect(a.basis).toMatch(/doesn't rate decisions/);
  });

  it("finds repeated themes in titles", () => {
    const list = buildDecisionInsights([dec("a", { title: "Prepay the car loan" }), dec("b", { title: "Car insurance renewal" }), dec("c", { title: "Sell the old car?" }), dec("d", { title: "Should I buy a laptop" })]);
    expect(list.filter((i) => i.kind === "themes").map((i) => i.title)).toEqual([]);
    const more = buildDecisionInsights([dec("a", { title: "Prepay home loan" }), dec("b", { title: "Home loan refinance" }), dec("c", { title: "Close the home loan" })]);
    expect(more.filter((i) => i.kind === "themes").map((i) => i.title)).toEqual(['"home" comes up often', '"loan" comes up often']);
  });

  it("measures time to decide and to look back as medians", () => {
    const list = buildDecisionInsights([withOutcome("a", 1, 1), withOutcome("b", 1, 1), withOutcome("c", 1, 1, { decidedAtMs: T0 + 10 * DAY })]);
    expect(list.find((i) => i.kind === "time_to_decide")!.title).toBe("You usually take about 2 days to decide");
    expect(list.find((i) => i.kind === "time_to_review")!.title).toBe("You look back about 30 days after deciding");
  });

  it("collects lessons newest first", () => {
    const list = buildDecisionInsights([
      withOutcome("a", 1, 1, { outcome: { recordedAtMs: T0, summary: "s", lessons: "old lesson" } }),
      withOutcome("b", 1, 1, { outcome: { recordedAtMs: T0 + DAY, summary: "s", lessons: "new lesson" } }),
    ]);
    expect(list.find((i) => i.kind === "lessons")!.body).toBe("“new lesson”  “old lesson”");
  });

  it("traces every insight to real decisions, explains it, and gives no advice", () => {
    const all = [...Array.from({ length: 6 }, (_, i) => withOutcome(`o${i}`, 100, 90 + i, { title: `Home loan step ${i}`, outcome: { recordedAtMs: T0 + 40 * DAY, summary: "s", amount: 90 + i, unit: "inr", userAssessment: "better", lessons: "keep a buffer" } })), dec("p", { status: "tracking" })];
    const list = buildDecisionInsights(all);
    const ids = new Set(all.map((d) => d.id));
    expect(list.length).toBeGreaterThan(6);
    for (const i of list) {
      expect(i.decisionIds.length).toBeGreaterThan(0);
      for (const id of i.decisionIds) expect(ids.has(id)).toBe(true);
      expect(i.basis.length).toBeGreaterThan(10);
    }
    const text = list.map((i) => `${i.title} ${i.body} ${i.basis}`).join(" ").toLowerCase();
    for (const w of ["recommend", "you should", "invest in", "switch to", "best option", "success", "failure"]) expect(text).not.toContain(w);
  });

  it("stays fast on a large history", () => {
    const many = Array.from({ length: 20_000 }, (_, i) =>
      i % 2 ? withOutcome(`w${i}`, 100, 90 + (i % 20), { title: `Home loan step ${i % 50}` }) : dec(`d${i}`, { title: `Buy item ${i % 50}`, category: i % 3 ? "purchase" : "savings" })
    );
    const t0 = performance.now();
    const out = buildDecisionInsights(many);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(out.length).toBeGreaterThan(5);
  });
});
