/**
 * SPENDLY-372 — end-to-end QA for Money Decisions (epic SPENDLY-361).
 *
 * Runs a decision through its whole life — template, capture, comparison,
 * links, decide, commitments, outcome, review, reopen, archive, restore —
 * and checks the epic's guarantees together:
 *
 *   1. No ledger data is mutated or duplicated; linked amounts never reach a total.
 *   2. The decide-time snapshot never changes, whatever happens afterwards.
 *   3. Every write is audited with field names only — never content.
 *   4. Everything the app writes is allowed by the Firestore rules.
 *   5. No decision text can reach logs.
 *   6. Large histories stay fast across history, follow-ups and insights.
 *
 * Results are summarised in docs/SPENDLY-372-decision-qa-rollout.md.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { getDecisionTemplate } from "../data/decisionTemplates";
import type { DecisionEvent, MoneyDecision } from "../types/decision";
import type { Account, Expense, Income } from "../types/expense";
import { addCommitment, followUps, setCommitmentStatus } from "./decisionCommitments";
import { alternativeTotals, compareAlternatives } from "./decisionComparison";
import { applyDecisionTemplate, decisionToForm, formToDecision } from "./decisionForm";
import { EMPTY_DECISION_FILTERS, filterDecisions } from "./decisionHistory";
import { buildDecisionInsights } from "./decisionInsights";
import { linkFromAccount, linkFromExpense, linkFromIncome, resolveDecisionLink, type DecisionLinkSources } from "./decisionLinks";
import { buildDecisionWrite, newDecisionDraft, transitionDecision, validateDecision } from "./decisionModel";
import { recordOutcome, reopenReview } from "./decisionOutcome";

const SECRET = "PRIVATE-REASONING-7731";
const account: Account = { id: "hdfc", name: "HDFC Savings", typeId: "t", last4: "4321" };
const expense: Expense & { id: string } = { id: "e1", amount: 75000, note: "Laptop", category: "Shopping & Clothing", date: "2026-09-12", month: "2026-09", accountId: "hdfc", createdAt: 1 };
const income: Income & { id: string } = { id: "i1", amount: 90000, note: "Salary", source: "Salary", date: "2026-09-01", month: "2026-09", createdAt: 1 };

const all = (v: boolean) => ({ transaction: v, account: v, borrowing: v, receivable: v, goal: v, subscription: v });
function sources(): DecisionLinkSources {
  return { expenses: [expense], incomes: [income], payments: [], transfers: [], entries: [], accounts: [account], borrowings: [], receivables: [], goals: [], subscriptions: [], ready: all(true), failed: all(false) };
}

/** Apply a change through the real builder, as the store does, collecting the audit trail. */
function journey() {
  const ledgerBefore = JSON.stringify({ expense, income, account });
  const events: Array<Omit<DecisionEvent, "id">> = [];
  let saved: MoneyDecision | null = null;
  let t = 1_000;
  const save = (next: MoneyDecision) => {
    t += 1_000;
    const w = buildDecisionWrite(saved, next, t);
    if (!w.ok) throw new Error(`write refused: ${w.issues.join()}`);
    events.push(w.event);
    saved = { ...w.data, id: next.id };
    return saved;
  };
  const step = (fn: (d: MoneyDecision) => MoneyDecision) => save(fn(saved!));
  const move = (to: MoneyDecision["status"]) =>
    step((d) => {
      const r = transitionDecision(d, to, t);
      if (!r.ok) throw new Error(`transition to ${to} refused: ${r.issues.join()}`);
      return r.decision;
    });

  // Capture from a template, with rationale and links.
  const draft = newDecisionDraft({ id: "dec1", title: "Buy a laptop?", category: "other", nowMs: t });
  let form = applyDecisionTemplate(decisionToForm(draft), getDecisionTemplate("purchase", 1));
  form = {
    ...form,
    rationale: SECRET,
    alternatives: [{ id: "a", title: "Buy now", notes: "" }, { id: "b", title: "Wait", notes: "" }],
    selectedAlternativeId: "a",
    expectedSummary: "Lasts 5 years",
    expectedAmount: "75000",
    links: [linkFromExpense(expense, "L1", t), linkFromIncome(income, "L2", t), linkFromAccount(account, "L3", t)],
  };
  save(formToDecision(form, draft));
  // Comparison inputs.
  step((d) => ({ ...d, alternatives: d.alternatives.map((a) => (a.id === "a" ? { ...a, inputs: [{ id: "p", label: "Price", amount: 75000, direction: "cost", frequency: "one_time", kind: "user_input" }] } : a)) }));
  move("decided");
  const snapshotAtDecide = JSON.stringify(saved!.decisionSnapshot);
  // Edits after deciding must not rewrite the snapshot.
  step((d) => ({ ...d, expected: { summary: "changed my mind", amount: 99999, unit: "inr" }, rationale: "edited later" }));
  step((d) => addCommitment(d, { id: "c1", text: "Sell old laptop", targetDate: "2026-10-15" }));
  step((d) => setCommitmentStatus(d, "c1", "done", t));
  move("tracking");
  step((d) => {
    const r = recordOutcome(d, { recordedAtMs: t, summary: "Works well", amount: 74000, unit: "inr", userAssessment: "as_expected", lessons: "Waiting was not needed" }, true, t);
    if (!r.ok) throw new Error();
    return r.decision;
  });
  step((d) => {
    const r = reopenReview(d, t);
    if (!r.ok) throw new Error();
    return r.decision;
  });
  move("reviewed");
  move("closed");
  move("archived");
  step((d) => {
    const r = transitionDecision(d, "closed", t);
    if (!r.ok) throw new Error();
    return r.decision;
  });
  return { final: saved!, events, snapshotAtDecide, ledgerBefore };
}

describe("1. ledger integrity", () => {
  const { final, ledgerBefore } = journey();

  it("never mutates the linked ledger records", () => {
    expect(JSON.stringify({ expense, income, account })).toBe(ledgerBefore);
  });

  it("stores no money row and no ledger-shaped fields", () => {
    expect(final).not.toHaveProperty("amount");
    expect(final).not.toHaveProperty("date");
    expect(final).not.toHaveProperty("accountId");
    expect(final.links.every((l) => !("amount" in l))).toBe(true);
  });

  it("never lets a linked amount reach a decision total", () => {
    const withoutLinks = { ...final, links: [] };
    expect(compareAlternatives(final)).toEqual(compareAlternatives(withoutLinks));
    expect(alternativeTotals(final.alternatives[0]).firstYearNet).toBe(-75000);
  });

  it("still resolves its links live, read-only", () => {
    const s = sources();
    const before = JSON.stringify(s);
    expect(final.links.map((l) => resolveDecisionLink(l, s).state)).toEqual(["ok", "ok", "ok"]);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("ends valid", () => {
    expect(final.status).toBe("closed");
    expect(validateDecision(final)).toEqual([]);
  });
});

describe("2. snapshot stability", () => {
  it("keeps the decide-time reasoning through edits, outcome, reopen, archive and restore", () => {
    const { final, snapshotAtDecide } = journey();
    expect(JSON.stringify(final.decisionSnapshot)).toBe(snapshotAtDecide);
    expect(final.decisionSnapshot?.expected?.amount).toBe(75000);
    expect(final.decisionSnapshot?.rationale).toBe(SECRET);
    expect(final.expected?.amount).toBe(99999);
  });
});

describe("3. audit trail", () => {
  const { events } = journey();

  it("records every write in order with an advancing revision", () => {
    expect(events[0].action).toBe("create");
    expect(events.map((e) => e.revision)).toEqual(events.map((_, i) => i + 1));
    expect(events.filter((e) => e.action === "status").map((e) => `${e.fromStatus}>${e.toStatus}`)).toEqual([
      "draft>decided",
      "decided>tracking",
      "tracking>reviewed",
      "reviewed>tracking",
      "tracking>reviewed",
      "reviewed>closed",
      "closed>archived",
      "archived>closed",
    ]);
  });

  it("never carries decision content", () => {
    const text = JSON.stringify(events);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("Sell old laptop");
    expect(text).not.toContain("Works well");
    expect(text).not.toContain("Laptop");
  });
});

describe("4. writes match the rules", () => {
  const rules = readFileSync("firestore.rules", "utf8");
  const allowlist = (fn: string) => {
    const body = rules.slice(rules.indexOf(`function ${fn}(`));
    const m = body.match(/keys\(\)\.hasOnly\(\[([^\]]*)\]\)/);
    return new Set([...(m?.[1] ?? "").matchAll(/'([^']+)'/g)].map((x) => x[1]));
  };

  it("every field the journey wrote is allowed by decisionWellFormed", () => {
    const { final } = journey();
    const { id, ...data } = final;
    void id;
    const allowed = allowlist("decisionWellFormed");
    for (const key of Object.keys(data)) expect(allowed.has(key)).toBe(true);
  });

  it("every event field is allowed by decisionEventWellFormed", () => {
    const allowed = allowlist("decisionEventWellFormed");
    for (const e of journey().events) for (const key of Object.keys(e)) expect(allowed.has(key)).toBe(true);
  });

  it("caps list sizes the same way the builder does", () => {
    expect(rules).toContain("d.alternatives.size() <= 20");
    expect(rules).toContain("d.links.size() <= 30");
    expect(rules).toContain("d.commitments.size() <= 30");
  });
});

describe("5. privacy in logs", () => {
  it("never passes decision content to logError from decision code", () => {
    const dirs = ["app/(app)/decisions", "components/decisions", "services/decisions"];
    const files = dirs.flatMap((d) => readdirSync(d).filter((f) => /\.tsx?$/.test(f)).map((f) => join(d, f)));
    const calls = files.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/logError\(([^)]*)\)/g)].map((m) => ({ f, args: m[1] })));
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      // Only a scope string and the error object — no third "context" argument.
      expect(c.args.split(",").length, `${c.f}: logError(${c.args})`).toBe(2);
    }
  });
});

describe("6. large histories", () => {
  it("history, follow-ups and insights stay fast together at 20,000 decisions", () => {
    const base = journey().final;
    const many: MoneyDecision[] = Array.from({ length: 20_000 }, (_, i) => ({
      ...base,
      id: `d${i}`,
      title: `${i % 2 ? "Home loan" : "Laptop"} decision ${i}`,
      status: (["decided", "tracking", "reviewed", "closed", "archived"] as const)[i % 5],
      reviewDate: i % 3 ? "2026-10-05" : undefined,
      createdAtMs: base.createdAtMs + i,
      updatedAtMs: base.updatedAtMs + i,
    }));
    const t0 = performance.now();
    filterDecisions(many, { ...EMPTY_DECISION_FILTERS, query: "loan" }, "2026-10-02");
    followUps(many, "2026-10-02");
    buildDecisionInsights(many);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});
