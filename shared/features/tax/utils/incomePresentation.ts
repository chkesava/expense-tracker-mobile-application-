/**
 * SPENDLY-290 — words and grouping for the tax income screen. Pure, so the
 * screen holds no rules: facts (where a figure came from), calculations
 * (what Spendly worked out) and the user's own decisions stay distinguishable.
 */

import { TAX_INCOME_CATEGORY_LABELS, TAX_INCOME_HEAD_LABELS } from "../data/categories";
import {
  TAX_INCOME_CATEGORIES,
  TAX_INCOME_HEADS,
  type TaxAttention,
  type TaxIncomeCategory,
  type TaxIncomeHead,
  type TaxLine,
} from "../types";
import { headOf, type TaxIncomeSummary } from "./income";
import type { TaxLineTotal } from "./lines";

export type TaxTone = "primary" | "success" | "warning" | "muted";

export function taxLineStatus(line: TaxLine): { label: string; tone: TaxTone } {
  if (line.state === "needs_review") return { label: "Check again", tone: "warning" };
  if (line.reasons.includes("user_replaced")) return { label: "Replaced", tone: "muted" };
  if (line.reasons.includes("user_excluded")) return { label: "Left out", tone: "muted" };
  if (line.state === "missing" || line.value === null) return { label: "Amount unknown", tone: "warning" };
  if (!line.included) return { label: "Not counted", tone: "muted" };
  if (line.state === "user_confirmed") return { label: "Confirmed", tone: "success" };
  return { label: "Counted", tone: "primary" };
}

export function taxLineOrigin(line: TaxLine): string {
  switch (line.provenance.origin) {
    case "spendly_derived":
      return "From your Spendly income";
    case "calculated":
      return "Calculated by Spendly";
    case "document":
      return "From a document";
    default:
      return "You added";
  }
}

const ATTENTION_TEXT: Record<TaxAttention, string> = {
  confirm_to_count: "Not counted until you confirm it is taxable income.",
  legacy_label: "Saved under an older label. It may be interest, a dividend or rent: check and pick the right category.",
  calculated:
    "Interest credited this year by Spendly's schedule. Your bank may report it differently (interest certificate or AIS). Confirm, or replace it with the bank's figure.",
};

export function taxLineHint(line: TaxLine): string | null {
  if (line.reasons.includes("source_changed")) {
    return line.override?.decision === "replace"
      ? "The income you replaced this with was deleted, so it counts again. Decide again."
      : "This changed after you decided. Check it and decide again.";
  }
  if (line.reasons.includes("user_replaced")) return "Replaced by an income you added.";
  if (line.reasons.includes("user_recategorized") && line.override) {
    return `Moved from ${categoryLabel(line.override.derivedCategory)}.`;
  }
  if (line.state === "user_confirmed") return null;
  return line.attention ? ATTENTION_TEXT[line.attention] : null;
}

export function categoryLabel(category: string): string {
  return TAX_INCOME_CATEGORY_LABELS[category as TaxIncomeCategory] ?? category;
}

/** Categories offered when the user moves an item or adds income. */
export const TAX_INCOME_CATEGORY_OPTIONS = TAX_INCOME_CATEGORIES.map((id) => ({
  id,
  label: TAX_INCOME_CATEGORY_LABELS[id],
}));

export interface TaxIncomeSection {
  head: TaxIncomeHead;
  title: string;
  total: TaxLineTotal;
  lines: TaxLine[];
}

/**
 * One section per head that has anything to show, in the order of the Act,
 * plus the lines that count nowhere (not income, left out, replaced).
 */
export function taxIncomeSections(summary: TaxIncomeSummary): {
  sections: TaxIncomeSection[];
  notCounted: TaxLine[];
} {
  const sections: TaxIncomeSection[] = [];
  const counted = new Set<string>();
  for (const head of TAX_INCOME_HEADS) {
    const lines = summary.lines.filter((l) => headOf(l.category) === head && (l.included || l.state === "needs_review"));
    for (const l of lines) counted.add(l.key);
    if (lines.length === 0 && !(head === "salary" && summary.salaryCredits.items.length > 0)) continue;
    sections.push({ head, title: TAX_INCOME_HEAD_LABELS[head], total: summary.byHead[head], lines });
  }
  return { sections, notCounted: summary.lines.filter((l) => !counted.has(l.key)) };
}

/** "3 of 12 months still loading" style copy for an incomplete year. */
export function incompleteText(summary: TaxIncomeSummary, online: boolean): string | null {
  if (summary.complete) return null;
  const n = summary.missingMonths.length;
  const months = `${n} month${n === 1 ? "" : "s"}`;
  return online
    ? `Loading ${months} of income for this year. Totals appear once every month is in.`
    : `${months} of income for this year aren't on this device. Totals appear once you're back online.`;
}
