/**
 * SPENDLY-365 — the alternatives / assumptions comparison workspace.
 *
 * Deterministic arithmetic over the numbers the user typed, and nothing else:
 *   - Every input stays a labelled user input; every total is labelled as
 *     calculated and says how.
 *   - Missing is `null`, never 0 — an option with no numbers says "not
 *     entered" instead of looking free.
 *   - Options come back in the user's own order. Nothing here ranks,
 *     scores or flags an option as better.
 */

import type {
  DecisionAlternative,
  DecisionAssumption,
  DecisionInput,
  MoneyDecision,
} from "../types/decision";
import { DECISION_LIMITS } from "../types/decision";
import { roundMoney } from "./money";

export interface AlternativeTotals {
  oneTimeCost: number | null;
  monthlyCost: number | null;
  yearlyCost: number | null;
  oneTimeBenefit: number | null;
  monthlyBenefit: number | null;
  yearlyBenefit: number | null;
  /**
   * Benefits minus costs over the first 12 months: one-time + 12 × monthly +
   * yearly. Null unless at least one number was entered.
   */
  firstYearNet: number | null;
}

export const FIRST_YEAR_BASIS = "Calculated from your inputs: one-time amounts + 12 × monthly + yearly, benefits minus costs.";

function sum(inputs: readonly DecisionInput[], direction: DecisionInput["direction"], frequency: DecisionInput["frequency"]): number | null {
  const matching = inputs.filter((i) => i.direction === direction && i.frequency === frequency);
  return matching.length === 0 ? null : roundMoney(matching.reduce((s, i) => s + i.amount, 0));
}

export function alternativeTotals(alternative: Pick<DecisionAlternative, "inputs">): AlternativeTotals {
  const inputs = alternative.inputs;
  const t: AlternativeTotals = {
    oneTimeCost: sum(inputs, "cost", "one_time"),
    monthlyCost: sum(inputs, "cost", "monthly"),
    yearlyCost: sum(inputs, "cost", "yearly"),
    oneTimeBenefit: sum(inputs, "benefit", "one_time"),
    monthlyBenefit: sum(inputs, "benefit", "monthly"),
    yearlyBenefit: sum(inputs, "benefit", "yearly"),
    firstYearNet: null,
  };
  if (inputs.length > 0) {
    const year = (v: number | null, mult = 1) => (v ?? 0) * mult;
    const benefits = year(t.oneTimeBenefit) + year(t.monthlyBenefit, 12) + year(t.yearlyBenefit);
    const costs = year(t.oneTimeCost) + year(t.monthlyCost, 12) + year(t.yearlyCost);
    t.firstYearNet = roundMoney(benefits - costs);
  }
  return t;
}

export interface ComparisonRow {
  alternative: DecisionAlternative;
  /** The user's own pick, if any — never Spendly's. */
  chosenByYou: boolean;
  totals: AlternativeTotals;
  hasNumbers: boolean;
  prosCount: number;
  consCount: number;
}

/** One row per option, in the order the user put them. */
export function compareAlternatives(decision: Pick<MoneyDecision, "alternatives" | "selectedAlternativeId">): ComparisonRow[] {
  return decision.alternatives.map((alternative) => ({
    alternative,
    chosenByYou: alternative.id === decision.selectedAlternativeId,
    totals: alternativeTotals(alternative),
    hasNumbers: alternative.inputs.length > 0,
    prosCount: alternative.pros.length,
    consCount: alternative.cons.length,
  }));
}

// ---------------------------------------------------------------------------
// Editing inputs
// ---------------------------------------------------------------------------

export type InputDraft = {
  id: string;
  label: string;
  amount: string;
  direction: DecisionInput["direction"];
  frequency: DecisionInput["frequency"];
};

export function inputToDraft(i: DecisionInput): InputDraft {
  return { id: i.id, label: i.label, amount: String(i.amount), direction: i.direction, frequency: i.frequency };
}

export type InputIssue = "label_required" | "label_too_long" | "amount_invalid" | "too_many";

/** Parse drafts into inputs; blank rows (no label, no amount) are dropped. */
export function draftsToInputs(drafts: readonly InputDraft[]): { ok: true; inputs: DecisionInput[] } | { ok: false; issues: Array<{ id: string; issue: InputIssue }> } {
  const issues: Array<{ id: string; issue: InputIssue }> = [];
  const inputs: DecisionInput[] = [];
  const rows = drafts.filter((d) => d.label.trim() || d.amount.trim());
  if (rows.length > DECISION_LIMITS.listItems) issues.push({ id: rows[DECISION_LIMITS.listItems].id, issue: "too_many" });
  for (const d of rows) {
    const text = d.amount.replace(/,/g, "").trim();
    if (!d.label.trim()) issues.push({ id: d.id, issue: "label_required" });
    else if (d.label.trim().length > DECISION_LIMITS.label) issues.push({ id: d.id, issue: "label_too_long" });
    if (!/^\d+(\.\d{0,2})?$/.test(text)) {
      issues.push({ id: d.id, issue: "amount_invalid" });
      continue;
    }
    inputs.push({ id: d.id, label: d.label.trim(), amount: roundMoney(Number(text)), direction: d.direction, frequency: d.frequency, kind: "user_input" });
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, inputs };
}

// ---------------------------------------------------------------------------
// What changed since the decision was made
// ---------------------------------------------------------------------------

export interface AssumptionChanges {
  added: DecisionAssumption[];
  removed: DecisionAssumption[];
  changed: Array<{ before: DecisionAssumption; after: DecisionAssumption }>;
}

/**
 * Assumptions now vs. the snapshot frozen when the user decided (362). Lets
 * the workspace say plainly what the user believed then and what they have
 * revised since, without ever rewriting the snapshot.
 */
export function assumptionChangesSinceDecision(decision: Pick<MoneyDecision, "assumptions" | "decisionSnapshot">): AssumptionChanges | null {
  const snap = decision.decisionSnapshot;
  if (!snap) return null;
  const before = new Map(snap.assumptions.map((a) => [a.id, a] as const));
  const now = new Map(decision.assumptions.map((a) => [a.id, a] as const));
  const added = decision.assumptions.filter((a) => !before.has(a.id));
  const removed = snap.assumptions.filter((a) => !now.has(a.id));
  const changed = decision.assumptions
    .filter((a) => before.has(a.id))
    .map((after) => ({ before: before.get(after.id)!, after }))
    .filter(({ before: b, after: a }) => b.text !== a.text || b.value !== a.value || b.unit !== a.unit);
  return { added, removed, changed };
}

export function hasAssumptionChanges(c: AssumptionChanges | null): boolean {
  return Boolean(c && (c.added.length || c.removed.length || c.changed.length));
}
