import { describe, expect, it } from "vitest";

import type { MoneyDecision } from "../types/decision";
import {
  EMPTY_DECISION_FILTERS,
  countActiveDecisionFilters,
  decisionSearchText,
  decisionTimeline,
  filterDecisions,
  matchesDecisionQuery,
  outcomeStatus,
  reviewFilterOf,
} from "./decisionHistory";
import { newDecisionDraft } from "./decisionModel";

const TODAY = "2026-10-02";
const ms = (date: string) => Date.parse(`${date}T10:00:00Z`);

function d(id: string, over: Partial<MoneyDecision> = {}): MoneyDecision {
  return { ...newDecisionDraft({ id, title: `Decision ${id}`, category: "other", nowMs: ms("2026-01-01") }), revision: 1, ...over };
}

const DECISIONS: MoneyDecision[] = [
  d("loan", { title: "Prepay the car loan?", category: "loan_debt", status: "tracking", createdAtMs: ms("2026-03-01"), decidedAtMs: ms("2026-03-10"), updatedAtMs: ms("2026-09-01"), reviewDate: "2026-09-30", alternatives: [{ id: "a", title: "Prepay ₹1 lakh", pros: [], cons: [], inputs: [] }], selectedAlternativeId: "a", links: [{ id: "L", kind: "borrowing", refId: "b1", capturedLabel: "Loan from SBI", capturedAtMs: 1 }] }),
  d("laptop", { title: "Buy a laptop", category: "purchase", status: "closed", createdAtMs: ms("2026-05-02"), decidedAtMs: ms("2026-05-05"), updatedAtMs: ms("2026-08-01"), outcome: { recordedAtMs: ms("2026-08-01"), summary: "Fine" } }),
  d("sip", { title: "Start a SIP", category: "investment", status: "draft", createdAtMs: ms("2026-09-20"), updatedAtMs: ms("2026-09-21") }),
  d("old", { title: "Old phone plan", category: "subscription", status: "archived", archivedFromStatus: "closed", createdAtMs: ms("2025-11-01"), decidedAtMs: ms("2025-11-02"), updatedAtMs: ms("2025-12-01") }),
  d("ins", { title: "Renew health cover", category: "insurance", status: "decided", createdAtMs: ms("2026-05-20"), decidedAtMs: ms("2026-05-21"), updatedAtMs: ms("2026-05-21"), reviewDate: "2027-05-01", rationale: "Family floater" }),
];

const ids = (list: MoneyDecision[]) => list.map((x) => x.id);

describe("search", () => {
  it("finds by title, category, options, linked records and rationale", () => {
    expect(matchesDecisionQuery(DECISIONS[0], "car")).toBe(true);
    expect(matchesDecisionQuery(DECISIONS[0], "loan or debt")).toBe(true);
    expect(matchesDecisionQuery(DECISIONS[0], "prepay lakh")).toBe(true);
    expect(matchesDecisionQuery(DECISIONS[0], "sbi")).toBe(true);
    expect(matchesDecisionQuery(DECISIONS[4], "floater")).toBe(true);
    expect(matchesDecisionQuery(DECISIONS[4], "car")).toBe(false);
  });

  it("matches every word, case-insensitively", () => {
    expect(matchesDecisionQuery(DECISIONS[0], "  CAR   sbi ")).toBe(true);
    expect(matchesDecisionQuery(DECISIONS[0], "car laptop")).toBe(false);
  });

  it("rebuilds cached text when the decision changes", () => {
    const x = d("c", { title: "Alpha" });
    expect(decisionSearchText(x)).toContain("alpha");
    const changed = { ...x, title: "Beta", revision: 2, updatedAtMs: x.updatedAtMs + 1 };
    expect(decisionSearchText(changed)).toContain("beta");
  });
});

describe("filters", () => {
  it("hides archived by default, but keeps it discoverable", () => {
    expect(ids(filterDecisions(DECISIONS, EMPTY_DECISION_FILTERS, TODAY))).not.toContain("old");
    expect(ids(filterDecisions(DECISIONS, { ...EMPTY_DECISION_FILTERS, includeArchived: true }, TODAY))).toContain("old");
    expect(ids(filterDecisions(DECISIONS, { ...EMPTY_DECISION_FILTERS, statuses: ["archived"] }, TODAY))).toEqual(["old"]);
    expect(ids(filterDecisions(DECISIONS, { ...EMPTY_DECISION_FILTERS, query: "phone" }, TODAY))).toEqual(["old"]);
  });

  it("keeps closed decisions in the default list", () => {
    expect(ids(filterDecisions(DECISIONS, EMPTY_DECISION_FILTERS, TODAY))).toContain("laptop");
  });

  it("filters by status, category, review and outcome", () => {
    expect(ids(filterDecisions(DECISIONS, { ...EMPTY_DECISION_FILTERS, statuses: ["draft"] }, TODAY))).toEqual(["sip"]);
    expect(ids(filterDecisions(DECISIONS, { ...EMPTY_DECISION_FILTERS, categories: ["purchase", "insurance"] }, TODAY)).sort()).toEqual(["ins", "laptop"]);
    expect(ids(filterDecisions(DECISIONS, { ...EMPTY_DECISION_FILTERS, review: ["due"] }, TODAY))).toEqual(["loan"]);
    expect(ids(filterDecisions(DECISIONS, { ...EMPTY_DECISION_FILTERS, review: ["scheduled"] }, TODAY))).toEqual(["ins"]);
    expect(ids(filterDecisions(DECISIONS, { ...EMPTY_DECISION_FILTERS, outcome: ["recorded"] }, TODAY))).toEqual(["laptop"]);
    expect(ids(filterDecisions(DECISIONS, { ...EMPTY_DECISION_FILTERS, outcome: ["awaiting"] }, TODAY)).sort()).toEqual(["ins", "loan"]);
    expect(countActiveDecisionFilters({ ...EMPTY_DECISION_FILTERS, statuses: ["draft"], includeArchived: true })).toBe(2);
  });

  it("classifies review and outcome state", () => {
    expect(reviewFilterOf(DECISIONS[0], TODAY)).toBe("due");
    expect(reviewFilterOf(DECISIONS[1], TODAY)).toBe("reviewed");
    expect(reviewFilterOf(DECISIONS[2], TODAY)).toBe("none");
    expect(outcomeStatus(DECISIONS[2])).toBe("not_applicable");
    expect(outcomeStatus(DECISIONS[3])).toBe("awaiting");
  });
});

describe("sorting and timeline", () => {
  it("orders by when each decision was made by default, newest first", () => {
    expect(ids(filterDecisions(DECISIONS, EMPTY_DECISION_FILTERS, TODAY))).toEqual(["sip", "ins", "laptop", "loan"]);
  });

  it("supports updated, created and title order", () => {
    expect(ids(filterDecisions(DECISIONS, { ...EMPTY_DECISION_FILTERS, sort: "updated" }, TODAY))).toEqual(["sip", "loan", "laptop", "ins"]);
    expect(ids(filterDecisions(DECISIONS, { ...EMPTY_DECISION_FILTERS, sort: "title" }, TODAY))).toEqual(["laptop", "loan", "ins", "sip"]);
  });

  it("groups into months without breaking chronology", () => {
    const sorted = filterDecisions(DECISIONS, { ...EMPTY_DECISION_FILTERS, includeArchived: true }, TODAY);
    const t = decisionTimeline(sorted, "decided");
    expect(t.map((i) => (i.type === "header" ? `[${i.label} ${i.count}]` : i.key))).toEqual([
      "[September 2026 1]", "sip",
      "[May 2026 2]", "ins", "laptop",
      "[March 2026 1]", "loan",
      "[November 2025 1]", "old",
    ]);
    expect(decisionTimeline(sorted, "title").every((i) => i.type === "decision")).toBe(true);
  });
});

describe("large histories", () => {
  it("filters and searches 20,000 decisions quickly", () => {
    const many = Array.from({ length: 20_000 }, (_, i) =>
      d(`m${i}`, { title: `Decision number ${i} about ${i % 3 ? "rent" : "loan"}`, category: i % 2 ? "purchase" : "loan_debt", status: (["draft", "decided", "closed", "archived"] as const)[i % 4], createdAtMs: ms("2024-01-01") + i * 60_000, updatedAtMs: ms("2024-01-01") + i * 60_000 })
    );
    const t0 = performance.now();
    const first = filterDecisions(many, { ...EMPTY_DECISION_FILTERS, query: "loan" }, TODAY);
    const t1 = performance.now();
    const again = filterDecisions(many, { ...EMPTY_DECISION_FILTERS, query: "loan 12" }, TODAY);
    const t2 = performance.now();
    decisionTimeline(first, "decided");
    expect(first.length).toBeGreaterThan(6000);
    expect(again.length).toBeGreaterThan(0);
    expect(t1 - t0).toBeLessThan(1500);
    expect(t2 - t1).toBeLessThan(t1 - t0 + 50);
  });
});
