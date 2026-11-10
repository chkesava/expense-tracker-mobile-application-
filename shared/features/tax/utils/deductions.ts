/**
 * SPENDLY-292 — the year's deductions: what Spendly can see (the EPF employee
 * share) and what the user claims. Every amount is traceable to its source
 * record; nothing here applies a cap or decides eligibility (SPENDLY-295
 * applies the versioned rules, the user confirms eligibility).
 *
 * - EPF: the employee share of the year's contributions whose money actually
 *   moved (confirmed, credited, partial), by wage month. Expected or draft
 *   months are left out and counted separately, so the figure never includes
 *   money that hasn't been deducted. Counted by default; the user can confirm,
 *   leave it out, or replace it with their own entry (e.g. the Form 16 figure).
 * - Claims: `taxEntries` of kind `deduction`. An existing Spendly investment
 *   can be linked (never copied). An eligibility-sensitive claim stays "confirm
 *   you're eligible" until the user confirms it, and asks again if the amount
 *   changes afterwards.
 */

import type { EpfContribution } from "@/shared/features/epf/types";
import { financialYearOfMonth } from "@/shared/utils/financialYear";
import { roundMoney } from "@/shared/utils/money";
import {
  DEDUCTION_GROUP_LABELS,
  DEDUCTION_GROUPS,
  deductionCategory,
  type DeductionGroup,
} from "../data/deductionCategories";
import type {
  FinancialYearKey,
  TaxDerivedItem,
  TaxEntry,
  TaxEntryOf,
  TaxLine,
  TaxReview,
} from "../types";
import { taxReviewDocId } from "./ids";
import { entryLine, resolveDerivedLine, sumTaxLines, type TaxLineTotal } from "./lines";

export const TAX_DEDUCTION_ENGINE_VERSION = 1;

/** Contribution states whose employee share was actually deducted. */
export const EPF_DEDUCTED_STATUSES: ReadonlySet<string> = new Set(["confirmed", "credited", "partial"]);

/** The derived EPF item's source id: one per year (its key carries the year). */
export const EPF_SHARE_SOURCE_ID = "employee-share";

export function epfEmployeeShareForYear(
  contributions: readonly Pick<EpfContribution, "month" | "employeeShare" | "status" | "archived">[],
  fy: FinancialYearKey
): { amount: number; months: number; notYetDeducted: number } {
  let amount = 0;
  let months = 0;
  let notYetDeducted = 0;
  for (const row of contributions) {
    if (row.archived || financialYearOfMonth(row.month) !== fy) continue;
    if (!EPF_DEDUCTED_STATUSES.has(row.status)) {
      if (row.status === "expected" || row.status === "draft") notYetDeducted += 1;
      continue;
    }
    if (typeof row.employeeShare !== "number" || !Number.isFinite(row.employeeShare)) continue;
    amount += row.employeeShare;
    months += 1;
  }
  return { amount: roundMoney(amount), months, notYetDeducted };
}

export function deriveEpfDeductionItem(
  contributions: readonly Pick<EpfContribution, "month" | "employeeShare" | "status" | "archived">[],
  fy: FinancialYearKey
): TaxDerivedItem | null {
  const share = epfEmployeeShareForYear(contributions, fy);
  if (share.months === 0) return null;
  return {
    fy,
    source: { kind: "epf_contribution", id: EPF_SHARE_SOURCE_ID },
    category: "epf_employee",
    value: share.amount,
    defaultIncluded: true,
    provenance: {
      origin: "spendly_derived",
      fy,
      sourceRef: { kind: "epf_contribution", id: EPF_SHARE_SOURCE_ID },
      engineVersion: TAX_DEDUCTION_ENGINE_VERSION,
    },
    label: `EPF, your share (${share.months} month${share.months === 1 ? "" : "s"})`,
  };
}

function sameAmount(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(roundMoney(a) - roundMoney(b)) < 0.005;
}

/** A claim the user entered, with its eligibility state. */
export function deductionEntryLine(entry: TaxEntryOf<"deduction">, reviews: ReadonlyMap<string, TaxReview>): TaxLine {
  const cat = deductionCategory(entry.fields.category);
  const line = entryLine(entry as TaxEntry, {
    category: entry.fields.category,
    value: entry.fields.amount,
    label: entry.label || cat?.label || "Deduction",
  });
  if (!cat?.eligibilitySensitive) return line;
  const review = reviews.get(taxReviewDocId(entry.fy, { kind: "tax_entry", id: entry.id }));
  if (review?.decision === "confirm" && sameAmount(review.sourceAmount, entry.fields.amount)) return line;
  return {
    ...line,
    state: "needs_review",
    reasons: [...line.reasons, review?.decision === "confirm" ? "source_changed" : "confirm_eligibility"],
  };
}

export interface TaxDeductionGroup {
  group: DeductionGroup;
  title: string;
  lines: TaxLine[];
  total: TaxLineTotal;
}

export interface TaxDeductionSummary {
  fy: FinancialYearKey;
  lines: TaxLine[];
  groups: TaxDeductionGroup[];
  /** EPF months whose money hasn't been deducted yet (left out of the figure). */
  epfNotYetDeducted: number;
  /** Categories counted from both Spendly and an entry: likely the same money twice. */
  overlaps: string[];
  needsReview: number;
}

export function groupOfCategory(category: string): DeductionGroup {
  return deductionCategory(category)?.group ?? "other";
}

export function assembleTaxDeductions(args: {
  fy: FinancialYearKey;
  entries: readonly TaxEntry[];
  reviews: readonly TaxReview[];
  contributions: readonly Pick<EpfContribution, "month" | "employeeShare" | "status" | "archived">[];
}): TaxDeductionSummary {
  const { fy } = args;
  const reviewById = new Map(args.reviews.filter((r) => r.fy === fy).map((r) => [r.id, r]));
  const live = args.entries.filter((e) => e.fy === fy && !e.deletedAt);
  const liveEntryIds = new Set(live.map((e) => e.id));

  const lines: TaxLine[] = [];
  const epf = deriveEpfDeductionItem(args.contributions, fy);
  if (epf) {
    lines.push(resolveDerivedLine(epf, reviewById.get(taxReviewDocId(fy, epf.source)), { liveEntryIds }));
  }
  for (const entry of live) {
    if (entry.kind === "deduction") lines.push(deductionEntryLine(entry as TaxEntryOf<"deduction">, reviewById));
  }

  const groups = DEDUCTION_GROUPS.map((group) => {
    const groupLines = lines.filter((l) => groupOfCategory(l.category) === group);
    return { group, title: DEDUCTION_GROUP_LABELS[group], lines: groupLines, total: sumTaxLines(groupLines.filter((l) => l.included)) };
  }).filter((g) => g.lines.length > 0);

  const counted = (fromUser: boolean) =>
    new Set(lines.filter((l) => l.included && (l.provenance.origin === "user_entered") === fromUser).map((l) => l.category));
  const mine = counted(true);
  const overlaps = [...counted(false)].filter((c) => mine.has(c)).sort();

  return {
    fy,
    lines,
    groups,
    epfNotYetDeducted: epfEmployeeShareForYear(args.contributions, fy).notYetDeducted,
    overlaps,
    needsReview: lines.filter((l) => l.state === "needs_review").length,
  };
}

export function deductionStatus(line: TaxLine): { label: string; tone: "primary" | "success" | "warning" | "muted" } {
  if (line.reasons.includes("confirm_eligibility")) return { label: "Confirm you're eligible", tone: "warning" };
  if (line.state === "needs_review") return { label: "Check again", tone: "warning" };
  if (line.reasons.includes("user_replaced")) return { label: "Replaced", tone: "muted" };
  if (!line.included) return { label: "Not claimed", tone: "muted" };
  if (line.state === "user_confirmed") return { label: "Claimed", tone: "success" };
  return { label: "Counted", tone: "primary" };
}
