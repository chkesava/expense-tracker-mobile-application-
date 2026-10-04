/**
 * SPENDLY-315 — pure logic behind the fee review / correction UI.
 *
 * The screen and sheet stay presentational: every rule about what a user may
 * submit, what "confirm" means and which fee a reversal can link to lives
 * here, tested, and goes through `validateFeeClassification` like the engine.
 */

import { feeSubtypeLabel, feeTypeLabel } from "../data/feeTaxonomy";
import type {
  FeeClassificationIssue,
  FeeClassificationInput,
} from "./feeModel";
import {
  countsTowardFeeTotals,
  defaultFeeComponents,
  feeComponentsTotal,
  feeReviewDocId,
  parseFeeReviewDocId,
  sameFeeSource,
  validateFeeClassification,
} from "./feeModel";
import type {
  FeeComponents,
  FeeRecord,
  FeeReviewDecision,
  FeeReviewHistoryEntry,
  FeeRole,
  FeeStatus,
  FeeTypeId,
} from "../types/fee";
import { daysBetweenDateKeys } from "./dates";
import { roundMoney } from "./money";

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export type FeeStatusTone = "primary" | "success" | "warning" | "muted";

/** Detected, needs review, confirmed and corrected must never look alike. */
export function feeStatusPresentation(status: FeeStatus): { label: string; tone: FeeStatusTone } {
  switch (status) {
    case "inferred":
      return { label: "Detected", tone: "primary" };
    case "uncertain":
      return { label: "Needs review", tone: "warning" };
    case "confirmed":
      return { label: "Confirmed", tone: "success" };
    case "user_corrected":
      return { label: "Corrected", tone: "success" };
  }
}

const ROLE_LABELS: Record<FeeRole, string> = {
  fee: "Fee",
  tax_on_fee: "GST on a fee",
  interest: "Interest",
  reversal: "Fee reversal",
  refund: "Fee refund",
  not_fee: "Not a fee",
};

export function feeRoleLabel(role: FeeRole): string {
  return ROLE_LABELS[role];
}

/** Roles a user may pick for a transaction, by direction. */
export function feeRolesFor(direction: "debit" | "credit"): FeeRole[] {
  return direction === "debit"
    ? ["fee", "tax_on_fee", "interest", "not_fee"]
    : ["reversal", "refund", "not_fee"];
}

/** "ATM / cash withdrawal · Other bank's ATM" */
export function feeRecordTitle(record: Pick<FeeRecord, "role" | "feeType" | "subtype">): string {
  if (record.role === "fee" && record.feeType) {
    const sub = feeSubtypeLabel(record.feeType, record.subtype);
    return sub ? `${feeTypeLabel(record.feeType)} · ${sub}` : feeTypeLabel(record.feeType);
  }
  if ((record.role === "reversal" || record.role === "refund" || record.role === "tax_on_fee") && record.feeType) {
    return `${feeRoleLabel(record.role)} · ${feeTypeLabel(record.feeType)}`;
  }
  return feeRoleLabel(record.role);
}

const ISSUE_MESSAGES: Record<FeeClassificationIssue, string> = {
  negative_component: "Amounts can't be negative.",
  components_do_not_sum: "The parts must add up to the transaction amount.",
  role_component_mismatch: "Those amounts don't fit this kind of charge.",
  direction_mismatch: "A fee is money out; a reversal or refund is money in.",
  fee_type_required: "Choose what kind of fee this is.",
  unknown_fee_type: "Choose a fee type from the list.",
  invalid_subtype: "That detail doesn't belong to this fee type.",
  link_required: "Choose the fee this belongs to.",
  self_link: "A transaction can't be linked to itself.",
};

export function feeIssueMessage(issue: FeeClassificationIssue | "invalid_amount"): string {
  return issue === "invalid_amount" ? "Enter amounts as numbers, like 20 or 3.60." : ISSUE_MESSAGES[issue];
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

/** What the correction sheet edits. Amounts are text so partial input survives. */
export interface FeeReviewDraft {
  role: FeeRole;
  feeType?: FeeTypeId;
  subtype?: string;
  principal: string;
  fee: string;
  tax: string;
  interest: string;
  /** Record key of the linked fee, or null for none. */
  linkedKey: string | null;
  note: string;
}

function amountText(value: number): string {
  return value === 0 ? "" : String(roundMoney(value));
}

export function draftFromRecord(record: FeeRecord, note = ""): FeeReviewDraft {
  return {
    role: record.role,
    feeType: record.feeType,
    subtype: record.subtype,
    principal: amountText(record.components.principal),
    fee: amountText(record.components.fee),
    tax: amountText(record.components.tax),
    interest: amountText(record.components.interest),
    linkedKey: record.linkedTo ? feeReviewDocId(record.linkedTo) : null,
    note,
  };
}

/** Switching role re-allocates the whole amount to the part that role implies. */
export function draftForRole(draft: FeeReviewDraft, role: FeeRole, amount: number): FeeReviewDraft {
  const c = defaultFeeComponents(role, amount);
  const keepsType = role === "fee" || role === "reversal" || role === "refund" || role === "tax_on_fee";
  const keepsLink = role === "tax_on_fee" || role === "reversal" || role === "refund";
  return {
    ...draft,
    role,
    feeType: keepsType ? draft.feeType : undefined,
    subtype: role === "fee" ? draft.subtype : undefined,
    principal: amountText(c.principal),
    fee: amountText(c.fee),
    tax: amountText(c.tax),
    interest: amountText(c.interest),
    linkedKey: keepsLink ? draft.linkedKey : null,
  };
}

export function draftWithFeeType(draft: FeeReviewDraft, feeType: FeeTypeId): FeeReviewDraft {
  return { ...draft, feeType, subtype: draft.feeType === feeType ? draft.subtype : undefined };
}

/**
 * "GST included at 18%": splits whatever is currently fee + tax into the two,
 * leaving any principal alone, so the parts still add up exactly.
 */
export function draftWithGstIncluded(draft: FeeReviewDraft, rate = 0.18): FeeReviewDraft {
  const fee = parseAmount(draft.fee) ?? 0;
  const tax = parseAmount(draft.tax) ?? 0;
  const charge = roundMoney(fee + tax);
  if (charge <= 0) return draft;
  const base = roundMoney(charge / (1 + rate));
  return { ...draft, fee: amountText(base), tax: amountText(roundMoney(charge - base)) };
}

function parseAmount(text: string): number | null {
  const trimmed = text.replace(/,/g, "").trim();
  if (trimmed === "") return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
  return roundMoney(Number(trimmed));
}

export type DraftResult =
  | { ok: true; classification: FeeClassificationInput }
  | { ok: false; issues: Array<FeeClassificationIssue | "invalid_amount"> };

/** Parse and validate a draft against its source transaction. */
export function draftToClassification(draft: FeeReviewDraft, record: FeeRecord): DraftResult {
  if (draft.role === "not_fee") {
    return { ok: true, classification: { role: "not_fee", components: defaultFeeComponents("not_fee", record.source.amount) } };
  }
  const parts = [draft.principal, draft.fee, draft.tax, draft.interest].map(parseAmount);
  if (parts.some((p) => p === null)) return { ok: false, issues: ["invalid_amount"] };
  const [principal, fee, tax, interest] = parts as number[];
  const linkedTo = draft.linkedKey ? parseFeeReviewDocId(draft.linkedKey) ?? undefined : undefined;
  const classification: FeeClassificationInput = {
    role: draft.role,
    ...(draft.feeType ? { feeType: draft.feeType } : {}),
    ...(draft.subtype ? { subtype: draft.subtype } : {}),
    components: { principal, fee, tax, interest },
    ...(linkedTo ? { linkedTo } : {}),
  };
  const issues = validateFeeClassification(classification, record.source);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, classification };
}

/** Remaining amount the parts must still account for (negative: over). */
export function draftRemainder(draft: FeeReviewDraft, amount: number): number | null {
  const parts = [draft.principal, draft.fee, draft.tax, draft.interest].map(parseAmount);
  if (parts.some((p) => p === null)) return null;
  const [principal, fee, tax, interest] = parts as number[];
  return roundMoney(amount - feeComponentsTotal({ principal, fee, tax, interest }));
}

function sameComponents(a: FeeComponents, b: FeeComponents): boolean {
  return (
    roundMoney(a.principal) === roundMoney(b.principal) &&
    roundMoney(a.fee) === roundMoney(b.fee) &&
    roundMoney(a.tax) === roundMoney(b.tax) &&
    roundMoney(a.interest) === roundMoney(b.interest)
  );
}

/**
 * Submitting the engine's reading unchanged is a confirmation; anything else
 * is a correction. Keeps "Confirmed" and "Corrected" honest in the UI.
 */
export function decisionFor(record: FeeRecord, classification: FeeClassificationInput): FeeReviewDecision {
  if (classification.role === "not_fee") return "not_fee";
  const unchanged =
    classification.role === record.role &&
    classification.feeType === record.feeType &&
    (classification.subtype ?? undefined) === (record.subtype ?? undefined) &&
    sameComponents(classification.components, record.components) &&
    (classification.linkedTo === undefined) === (record.linkedTo === undefined) &&
    (!classification.linkedTo || sameFeeSource(classification.linkedTo, record.linkedTo));
  return unchanged ? "confirm" : "correct";
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/**
 * Fees a GST row, reversal or refund may link to: counted debit fees on the
 * same account (or either side unknown), GST within a week either side,
 * credits up to 180 days after the fee. Closest in time first.
 */
export function feeLinkOptions(record: FeeRecord, records: readonly FeeRecord[], role: FeeRole = record.role): FeeRecord[] {
  if (role !== "tax_on_fee" && role !== "reversal" && role !== "refund") return [];
  const options: Array<{ record: FeeRecord; distance: number }> = [];
  for (const candidate of records) {
    if (candidate.key === record.key) continue;
    if (candidate.role !== "fee" || !countsTowardFeeTotals(candidate)) continue;
    if (candidate.source.direction !== "debit") continue;
    if (record.source.accountId && candidate.source.accountId && record.source.accountId !== candidate.source.accountId) continue;
    const days = daysBetweenDateKeys(candidate.source.date, record.source.date);
    const ok = role === "tax_on_fee" ? Math.abs(days) <= 7 : days >= 0 && days <= 180;
    if (ok) options.push({ record: candidate, distance: Math.abs(days) });
  }
  return options
    .sort((a, b) => a.distance - b.distance || a.record.key.localeCompare(b.record.key))
    .slice(0, 20)
    .map((o) => o.record);
}

// ---------------------------------------------------------------------------
// Bulk review
// ---------------------------------------------------------------------------

export interface BulkPlan {
  ready: Array<{ record: FeeRecord; classification: FeeClassificationInput; decision: FeeReviewDecision }>;
  /** Records that cannot be bulk-confirmed as they stand; open them one by one. */
  skipped: FeeRecord[];
}

/**
 * "Confirm all" confirms each record's current reading only where that reading
 * is internally valid; a conflicting reading needs a human decision, not a
 * bulk tap. "Not fees" always applies.
 */
export function bulkReviewPlan(records: readonly FeeRecord[], decision: "confirm" | "not_fee"): BulkPlan {
  const plan: BulkPlan = { ready: [], skipped: [] };
  for (const record of records) {
    if (decision === "not_fee") {
      plan.ready.push({
        record,
        decision: "not_fee",
        classification: { role: "not_fee", components: defaultFeeComponents("not_fee", record.source.amount) },
      });
      continue;
    }
    const classification: FeeClassificationInput = {
      role: record.role,
      ...(record.feeType ? { feeType: record.feeType } : {}),
      ...(record.subtype ? { subtype: record.subtype } : {}),
      components: record.components,
      ...(record.linkedTo ? { linkedTo: record.linkedTo } : {}),
    };
    const invalid =
      record.role === "not_fee" ||
      record.uncertainReason === "broken_link" ||
      record.uncertainReason === "source_changed" ||
      validateFeeClassification(classification, record.source).length > 0;
    if (invalid) plan.skipped.push(record);
    else plan.ready.push({ record, classification, decision: "confirm" });
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Review list ordering and history
// ---------------------------------------------------------------------------

/** Candidates first (newest first), then everything else newest first. */
export function sortForReview(records: readonly FeeRecord[]): FeeRecord[] {
  return [...records].sort((a, b) => {
    const au = a.status === "uncertain" ? 0 : 1;
    const bu = b.status === "uncertain" ? 0 : 1;
    if (au !== bu) return au - bu;
    if (a.source.date !== b.source.date) return a.source.date < b.source.date ? 1 : -1;
    return a.key.localeCompare(b.key);
  });
}

export function uncertainReasonText(reason?: FeeRecord["uncertainReason"]): string | undefined {
  switch (reason) {
    case "ambiguous":
      return "Spendly isn't sure this is a fee.";
    case "conflicting_signals":
      return "The details point different ways.";
    case "source_changed":
      return "The transaction changed after you reviewed it.";
    case "broken_link":
      return "The fee this belongs to isn't a confirmed fee.";
    default:
      return undefined;
  }
}

export function describeHistoryEntry(entry: FeeReviewHistoryEntry): string {
  const what =
    entry.decision === "not_fee"
      ? "Marked not a fee"
      : `${entry.decision === "confirm" ? "Confirmed" : "Corrected"} as ${feeRecordTitle(entry)}`;
  return `Revision ${entry.revision}: ${what}`;
}
