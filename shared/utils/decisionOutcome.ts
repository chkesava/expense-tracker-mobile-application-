/**
 * SPENDLY-369 — expected vs actual outcomes and the review lifecycle.
 *
 *   - The expected side always comes from the snapshot frozen when the user
 *     decided (362) when one exists, so a later edit to the live expectation
 *     can never quietly change what the user is compared against.
 *   - A difference is calculated only when both sides are amounts in the same
 *     unit. Otherwise the reason is returned instead of a number.
 *   - Spendly never judges success or failure. The only verdict is the user's
 *     own `userAssessment`, and it is optional.
 */

import type { DecisionExpected, DecisionOutcome, DecisionUnit, MoneyDecision } from "../types/decision";
import { DECISION_LIMITS } from "../types/decision";
import { transitionDecision, type TransitionResult } from "./decisionModel";
import { roundMoney } from "./money";

export interface ExpectedForReview {
  expected: DecisionExpected | null;
  /** Where it came from: the decide-time snapshot, the live field, or nowhere. */
  source: "snapshot" | "live" | "none";
  /** The live expectation differs from the snapshot (it was edited after deciding). */
  editedSinceDecided: boolean;
}

function same(a?: DecisionExpected, b?: DecisionExpected): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function expectedForReview(d: Pick<MoneyDecision, "expected" | "decisionSnapshot">): ExpectedForReview {
  if (d.decisionSnapshot) {
    return { expected: d.decisionSnapshot.expected ?? null, source: "snapshot", editedSinceDecided: !same(d.decisionSnapshot.expected, d.expected) };
  }
  return { expected: d.expected ?? null, source: d.expected ? "live" : "none", editedSinceDecided: false };
}

export type VarianceResult =
  | { ok: true; expected: number; actual: number; delta: number; pct: number | null; unit: DecisionUnit }
  | { ok: false; reason: "no_expected_amount" | "no_actual_amount" | "different_units" };

export const VARIANCE_REASON_TEXT: Record<Extract<VarianceResult, { ok: false }>["reason"], string> = {
  no_expected_amount: "No difference shown — you didn't set an expected amount.",
  no_actual_amount: "No difference shown — no actual amount was recorded.",
  different_units: "No difference shown — expected and actual aren't in the same unit.",
};

/** Actual minus expected, only when the two are genuinely comparable. */
export function outcomeVariance(expected: DecisionExpected | null, outcome: DecisionOutcome | undefined): VarianceResult {
  if (expected?.amount === undefined) return { ok: false, reason: "no_expected_amount" };
  if (outcome?.amount === undefined) return { ok: false, reason: "no_actual_amount" };
  const eu = expected.unit ?? "inr";
  const au = outcome.unit ?? "inr";
  if (eu !== au) return { ok: false, reason: "different_units" };
  const delta = roundMoney(outcome.amount - expected.amount);
  return {
    ok: true,
    expected: expected.amount,
    actual: outcome.amount,
    delta,
    pct: expected.amount !== 0 ? Math.round((delta / Math.abs(expected.amount)) * 1000) / 10 : null,
    unit: eu,
  };
}

/** Neutral wording: "more" / "less" than expected — never "better" or "worse". */
export function varianceSentence(v: Extract<VarianceResult, { ok: true }>, format: (n: number) => string): string {
  if (v.delta === 0) return "Exactly as expected.";
  const dir = v.delta > 0 ? "more" : "less";
  const pct = v.pct === null ? "" : ` (${Math.abs(v.pct)}%)`;
  return `${format(Math.abs(v.delta))}${pct} ${dir} than you expected.`;
}

export const ASSESSMENT_LABELS: Record<NonNullable<DecisionOutcome["userAssessment"]>, string> = {
  better: "Better than I expected",
  as_expected: "About as expected",
  worse: "Worse than I expected",
  mixed: "Mixed",
  unsure: "Not sure yet",
};

// ---------------------------------------------------------------------------
// Recording the outcome
// ---------------------------------------------------------------------------

export interface OutcomeDraft {
  summary: string;
  amount: string;
  outcomeDate: string;
  userAssessment: DecisionOutcome["userAssessment"] | null;
  lessons: string;
  reviewNotes: string;
}

export const EMPTY_OUTCOME_DRAFT: OutcomeDraft = { summary: "", amount: "", outcomeDate: "", userAssessment: null, lessons: "", reviewNotes: "" };

export function outcomeToDraft(o?: DecisionOutcome): OutcomeDraft {
  if (!o) return { ...EMPTY_OUTCOME_DRAFT };
  return {
    summary: o.summary,
    amount: o.amount === undefined ? "" : String(o.amount),
    outcomeDate: o.outcomeDate ?? "",
    userAssessment: o.userAssessment ?? null,
    lessons: o.lessons ?? "",
    reviewNotes: o.reviewNotes ?? "",
  };
}

export type OutcomeIssue = "summary_required" | "too_long" | "invalid_amount" | "invalid_date";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A summary is the only requirement, so a purely qualitative outcome
 * ("Glad I waited — the price dropped") is a complete one.
 */
export function draftToOutcome(draft: OutcomeDraft, nowMs: number, unit: DecisionUnit = "inr"): { ok: true; outcome: DecisionOutcome } | { ok: false; issues: OutcomeIssue[] } {
  const issues: OutcomeIssue[] = [];
  const summary = draft.summary.trim();
  if (!summary) issues.push("summary_required");
  if ([draft.summary, draft.lessons, draft.reviewNotes].some((t) => t.trim().length > DECISION_LIMITS.text)) issues.push("too_long");
  const amountText = draft.amount.replace(/,/g, "").trim();
  if (amountText && !/^-?\d+(\.\d{0,2})?$/.test(amountText)) issues.push("invalid_amount");
  if (draft.outcomeDate) {
    const d = new Date(`${draft.outcomeDate}T00:00:00Z`);
    if (!YMD.test(draft.outcomeDate) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== draft.outcomeDate) issues.push("invalid_date");
  }
  if (issues.length > 0) return { ok: false, issues };
  const outcome: DecisionOutcome = { recordedAtMs: nowMs, summary };
  if (amountText) {
    outcome.amount = roundMoney(Number(amountText));
    outcome.unit = unit;
  }
  if (draft.outcomeDate) outcome.outcomeDate = draft.outcomeDate;
  if (draft.userAssessment) outcome.userAssessment = draft.userAssessment;
  if (draft.lessons.trim()) outcome.lessons = draft.lessons.trim();
  if (draft.reviewNotes.trim()) outcome.reviewNotes = draft.reviewNotes.trim();
  return { ok: true, outcome };
}

/**
 * Record (or update) the outcome. With `completeReview`, a decided or tracked
 * decision moves to "reviewed". The expected side is never touched.
 */
export function recordOutcome(d: MoneyDecision, outcome: DecisionOutcome, completeReview: boolean, nowMs: number): TransitionResult {
  const withOutcome: MoneyDecision = { ...d, outcome };
  if (!completeReview || d.status === "reviewed" || d.status === "closed") return { ok: true, decision: withOutcome };
  return transitionDecision(withOutcome, "reviewed", nowMs);
}

/** Reviewed → tracking, or closed → reviewed. The recorded outcome is kept. */
export function reopenReview(d: MoneyDecision, nowMs: number): TransitionResult {
  if (d.status === "reviewed") return transitionDecision(d, "tracking", nowMs);
  if (d.status === "closed") return transitionDecision(d, "reviewed", nowMs);
  return { ok: false, issues: ["invalid_transition"] };
}

export function canRecordOutcome(d: Pick<MoneyDecision, "status">): boolean {
  return d.status === "decided" || d.status === "tracking" || d.status === "reviewed" || d.status === "closed";
}
