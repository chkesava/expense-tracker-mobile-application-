/**
 * SPENDLY-363 — pure logic behind the Money Decisions capture flow.
 *
 * The form edits a subset of `MoneyDecision` as text; everything the form
 * does not show (pros/cons/inputs, outcome, commitments, snapshot, status) is
 * carried over untouched from the decision being edited, so editing here can
 * never drop data another screen wrote.
 */

import {
  DECISION_LIMITS,
  type DecisionAlternative,
  type DecisionAssumption,
  type DecisionCategory,
  type DecisionLink,
  type MoneyDecision,
} from "../types/decision";
import type { DecisionTemplate } from "../data/decisionTemplates";
import { shiftDateKey } from "./dates";
import { roundMoney } from "./money";

export const DECISION_STEPS = [
  { id: "question", title: "The decision" },
  { id: "context", title: "Context" },
  { id: "options", title: "Options" },
  { id: "choice", title: "Your choice" },
  { id: "expected", title: "Expected & review" },
] as const;

export type DecisionStepId = (typeof DECISION_STEPS)[number]["id"];

export interface DecisionFormState {
  title: string;
  category: DecisionCategory;
  /** SPENDLY-364 — template the prompts come from, at its version. */
  templateId: string | null;
  templateVersion: number | null;
  situation: string;
  goal: string;
  constraints: string[];
  assumptions: Array<{ id: string; text: string }>;
  alternatives: Array<{ id: string; title: string; notes: string }>;
  selectedAlternativeId: string | null;
  rationale: string;
  confidence: number | null;
  expectedSummary: string;
  expectedAmount: string;
  expectedByDate: string;
  reviewDate: string;
  links: DecisionLink[];
}

/** Short random id for list items inside one decision. */
export function newItemId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function decisionToForm(d: MoneyDecision): DecisionFormState {
  return {
    title: d.title,
    category: d.category,
    templateId: d.templateId ?? null,
    templateVersion: d.templateVersion ?? null,
    situation: d.context.situation ?? "",
    goal: d.context.goal ?? "",
    constraints: [...d.context.constraints],
    assumptions: d.assumptions.filter((a) => a.source === "user").map((a) => ({ id: a.id, text: a.text })),
    alternatives: d.alternatives.map((a) => ({ id: a.id, title: a.title, notes: a.notes ?? "" })),
    selectedAlternativeId: d.selectedAlternativeId ?? null,
    rationale: d.rationale ?? "",
    confidence: d.confidence ?? null,
    expectedSummary: d.expected?.summary ?? "",
    expectedAmount: d.expected?.amount === undefined ? "" : String(d.expected.amount),
    expectedByDate: d.expected?.byDate ?? "",
    reviewDate: d.reviewDate ?? "",
    links: [...d.links],
  };
}

function parseAmount(text: string): number | null | "invalid" {
  const t = text.replace(/,/g, "").trim();
  if (!t) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return "invalid";
  return roundMoney(Number(t));
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(text: string): boolean {
  if (!YMD.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

export type DecisionFormIssue = { field: string; message: string };

/** Issues for one step. Only the first step has a required field. */
export function decisionStepIssues(form: DecisionFormState, step: DecisionStepId): DecisionFormIssue[] {
  const L = DECISION_LIMITS;
  const out: DecisionFormIssue[] = [];
  switch (step) {
    case "question":
      if (!form.title.trim()) out.push({ field: "title", message: "Say what you're deciding, in a few words." });
      if (form.title.trim().length > L.title) out.push({ field: "title", message: `Keep it under ${L.title} characters.` });
      break;
    case "context":
      if (form.situation.length > L.text || form.goal.length > L.text) out.push({ field: "context", message: "That's longer than we can save — shorten it a little." });
      if (form.constraints.filter((c) => c.trim()).length > L.listItems) out.push({ field: "constraints", message: `Up to ${L.listItems} constraints.` });
      if (form.assumptions.filter((a) => a.text.trim()).length > L.assumptions) out.push({ field: "assumptions", message: `Up to ${L.assumptions} assumptions.` });
      break;
    case "options":
      if (form.alternatives.length > L.alternatives) out.push({ field: "alternatives", message: `Up to ${L.alternatives} options.` });
      form.alternatives.forEach((a, i) => {
        if (!a.title.trim()) out.push({ field: `alternative.${i}`, message: `Name option ${i + 1}, or remove it.` });
        else if (a.title.trim().length > L.label) out.push({ field: `alternative.${i}`, message: `Option ${i + 1}'s name is too long.` });
      });
      break;
    case "choice":
      if (form.selectedAlternativeId && !form.alternatives.some((a) => a.id === form.selectedAlternativeId)) {
        out.push({ field: "selected", message: "The option you picked was removed — pick again." });
      }
      if (form.rationale.length > L.text) out.push({ field: "rationale", message: "That's longer than we can save — shorten it a little." });
      break;
    case "expected":
      if (parseAmount(form.expectedAmount) === "invalid") out.push({ field: "expectedAmount", message: "Enter an amount like 5000 or 1250.50." });
      if (form.expectedByDate && !isValidDate(form.expectedByDate)) out.push({ field: "expectedByDate", message: "Use a date like 2027-03-31." });
      if (form.reviewDate && !isValidDate(form.reviewDate)) out.push({ field: "reviewDate", message: "Use a date like 2027-03-31." });
      break;
  }
  return out;
}

export function decisionFormIssues(form: DecisionFormState): DecisionFormIssue[] {
  return DECISION_STEPS.flatMap((s) => decisionStepIssues(form, s.id));
}

/** The first step that has a problem, for jumping back on save. */
export function firstStepWithIssues(form: DecisionFormState): DecisionStepId | null {
  return DECISION_STEPS.find((s) => decisionStepIssues(form, s.id).length > 0)?.id ?? null;
}

/**
 * Apply the form onto the decision being edited. Blank list rows are dropped;
 * fields the form does not own are kept exactly as they were.
 */
export function formToDecision(form: DecisionFormState, base: MoneyDecision): MoneyDecision {
  const byId = new Map(base.alternatives.map((a) => [a.id, a] as const));
  const alternatives: DecisionAlternative[] = form.alternatives
    .filter((a) => a.title.trim())
    .map((a) => {
      const prev = byId.get(a.id);
      const next: DecisionAlternative = { id: a.id, title: a.title.trim(), pros: prev?.pros ?? [], cons: prev?.cons ?? [], inputs: prev?.inputs ?? [] };
      if (a.notes.trim()) next.notes = a.notes.trim();
      if (prev?.nonFinancial) next.nonFinancial = prev.nonFinancial;
      return next;
    });

  const nonUser = base.assumptions.filter((a) => a.source !== "user");
  const prevUser = new Map(base.assumptions.filter((a) => a.source === "user").map((a) => [a.id, a] as const));
  const userAssumptions: DecisionAssumption[] = form.assumptions
    .filter((a) => a.text.trim())
    .map((a) => ({ ...(prevUser.get(a.id) ?? { source: "user" as const }), id: a.id, text: a.text.trim(), source: "user" as const }));

  const amount = parseAmount(form.expectedAmount);
  const selected = form.selectedAlternativeId && alternatives.some((a) => a.id === form.selectedAlternativeId) ? form.selectedAlternativeId : undefined;

  const next: MoneyDecision = {
    ...base,
    title: form.title.trim(),
    category: form.category,
    context: {
      ...(form.situation.trim() ? { situation: form.situation.trim() } : {}),
      ...(form.goal.trim() ? { goal: form.goal.trim() } : {}),
      constraints: form.constraints.map((c) => c.trim()).filter(Boolean),
    },
    alternatives,
    assumptions: [...userAssumptions, ...nonUser],
    links: form.links,
  };
  if (form.templateId) {
    next.templateId = form.templateId;
    if (form.templateVersion !== null) next.templateVersion = form.templateVersion;
    else delete next.templateVersion;
  } else {
    delete next.templateId;
    delete next.templateVersion;
  }
  if (selected) next.selectedAlternativeId = selected;
  else delete next.selectedAlternativeId;
  if (form.rationale.trim()) next.rationale = form.rationale.trim();
  else delete next.rationale;
  if (form.confidence) next.confidence = form.confidence;
  else delete next.confidence;
  if (form.expectedSummary.trim() || typeof amount === "number" || form.expectedByDate) {
    next.expected = {
      summary: form.expectedSummary.trim(),
      ...(typeof amount === "number" ? { amount, unit: "inr" as const } : {}),
      ...(form.expectedByDate ? { byDate: form.expectedByDate } : {}),
    };
  } else {
    delete next.expected;
  }
  if (form.reviewDate) next.reviewDate = form.reviewDate;
  else delete next.reviewDate;
  return next;
}

/** Move one list item up (−1) or down (+1). Out-of-range moves are no-ops. */
export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item);
  return next;
}

/** Quick review-date choices, relative to today. */
export function reviewDateChoices(today: string): Array<{ label: string; date: string }> {
  return [
    { label: "In 1 month", date: shiftDateKey(today, 30) },
    { label: "In 3 months", date: shiftDateKey(today, 91) },
    { label: "In 6 months", date: shiftDateKey(today, 182) },
    { label: "In 1 year", date: shiftDateKey(today, 365) },
  ];
}

/** Anything typed that a save would keep? Drives the unsaved-changes guard. */
export function isDecisionFormDirty(form: DecisionFormState, saved: DecisionFormState): boolean {
  return JSON.stringify(form) !== JSON.stringify(saved);
}

// ---------------------------------------------------------------------------
// Templates (SPENDLY-364)
// ---------------------------------------------------------------------------

/**
 * Start from a template: records which template (and version) the prompts
 * came from and sets its category. Nothing the user typed is changed, and no
 * answer is filled in on their behalf — suggestions stay suggestions.
 */
export function applyDecisionTemplate(form: DecisionFormState, template: DecisionTemplate): DecisionFormState {
  return { ...form, templateId: template.id, templateVersion: template.version, category: template.category };
}

const norm = (s: string) => s.trim().toLocaleLowerCase();

/** Suggestions not already in the list (so tapping one twice adds it once). */
export function unusedSuggestions(suggestions: readonly string[], existing: readonly string[]): string[] {
  const have = new Set(existing.map(norm));
  return suggestions.filter((s) => !have.has(norm(s)));
}

export function addSuggestedConstraint(form: DecisionFormState, text: string): DecisionFormState {
  if (unusedSuggestions([text], form.constraints).length === 0) return form;
  return { ...form, constraints: [...form.constraints, text] };
}

export function addSuggestedAssumption(form: DecisionFormState, text: string, id = newItemId()): DecisionFormState {
  if (unusedSuggestions([text], form.assumptions.map((a) => a.text)).length === 0) return form;
  return { ...form, assumptions: [...form.assumptions, { id, text }] };
}

export function addSuggestedOption(form: DecisionFormState, text: string, id = newItemId()): DecisionFormState {
  if (unusedSuggestions([text], form.alternatives.map((a) => a.title)).length === 0) return form;
  return { ...form, alternatives: [...form.alternatives, { id, title: text, notes: "" }] };
}
