/**
 * SPENDLY-289 — validation for everything the tax center stores.
 *
 * Pure and exhaustive: the store (SPENDLY-709) refuses a write with any issue,
 * and firestore.rules mirror the structural part (shape, enums, bounds,
 * ownership). Dates and amounts are checked here because the rules can't know
 * financial-year boundaries.
 */

import { isValidDateKey } from "@/shared/utils/dates";
import { roundMoney } from "@/shared/utils/money";
import {
  TAX_AGE_BANDS,
  TAX_AIS_CATEGORIES,
  TAX_ASSET_CLASSES,
  TAX_CAPITAL_GAIN_MODES,
  TAX_DOCUMENT_CATEGORIES,
  TAX_DOCUMENT_STATUSES,
  TAX_ENTRY_KINDS,
  TAX_INCOME_CATEGORIES,
  TAX_LIMITS,
  TAX_PAYMENT_TYPES,
  TAX_PROOF_STATUSES,
  TAX_QUARTERS,
  TAX_REGIME_NOTES,
  TAX_RESIDENTIAL_STATUSES,
  TAX_LAWS,
  TAX_REVIEW_DECISIONS,
  TAX_SNAPSHOT_REASONS,
  TAX_SOURCE_KINDS,
  TAX_STATEMENTS,
  TAX_TDS_FORMS,
  type FinancialYearKey,
  type TaxDocument,
  type TaxEntryFieldsByKind,
  type TaxEntryKind,
  type TaxProfile,
  type TaxReview,
  type TaxSnapshot,
  type TaxSourceRef,
} from "../types";
import { isOwnTaxStoragePath, isTaxSourceKind, isValidTaxIdSegment, taxSnapshotDocId } from "./ids";
import { financialYearDateBounds, isDateInFinancialYear, isFinancialYearKey } from "./taxYear";

export type TaxIssueCode =
  | "required"
  | "invalid_year"
  | "invalid_date"
  | "date_outside_year"
  | "date_before_year"
  | "date_in_future"
  | "date_order"
  | "invalid_amount"
  | "amount_not_positive"
  | "invalid_quantity"
  | "invalid_format"
  | "invalid_option"
  | "too_long"
  | "too_many"
  | "not_allowed"
  | "not_owner";

export interface TaxIssue {
  field: string;
  code: TaxIssueCode;
}

export interface TaxValidationContext {
  /** YYYY-MM-DD. When given, dates that must be in the past are checked against it. */
  todayKey?: string;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/**
 * Rupees: finite, 0 or more, within `TAX_LIMITS.maxAmount`, and exactly a paise
 * value (float noise such as 0.1 + 0.2 is refused; the builders round first).
 */
export function isTaxMoney(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= TAX_LIMITS.maxAmount &&
    roundMoney(value) === value
  );
}

/** Deductor/collector TAN: four letters, five digits, one letter. */
export const TAN_PATTERN = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
/** BSR code of the receiving bank branch. */
export const BSR_PATTERN = /^[0-9]{7}$/;
export const CHALLAN_SERIAL_PATTERN = /^[0-9]{5}$/;
/** Challan identification number: BSR (7) + date DDMMYYYY (8) + serial (5). */
export const CIN_PATTERN = /^[0-9]{20}$/;
export const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
/**
 * TDS section as printed ("194A", "194J(b)"). Free-form on purpose: the 2025
 * Act renumbers TDS provisions, so a fixed list would be wrong for one law.
 */
export const TDS_SECTION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z()./ -]{0,23}$/;
/** A category id: an income category or a deduction catalog id (SPENDLY-292). */
export const CATEGORY_ID_PATTERN = /^[a-z0-9_]{2,40}$/;

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

class Issues {
  readonly list: TaxIssue[] = [];
  add(field: string, code: TaxIssueCode): void {
    this.list.push({ field, code });
  }

  requiredText(field: string, value: unknown, max: number): void {
    if (typeof value !== "string" || !value.trim()) this.add(field, "required");
    else if (value.length > max) this.add(field, "too_long");
  }

  optionalText(field: string, value: unknown, max: number): void {
    if (value === undefined) return;
    if (typeof value !== "string") this.add(field, "invalid_format");
    else if (value.length > max) this.add(field, "too_long");
  }

  money(field: string, value: unknown, opts: { positive?: boolean } = {}): void {
    if (value === undefined || value === null) this.add(field, "required");
    else if (!isTaxMoney(value)) this.add(field, "invalid_amount");
    else if (opts.positive && value <= 0) this.add(field, "amount_not_positive");
  }

  /** `undefined` and `null` both mean "not known"; anything else must be money. */
  optionalMoney(field: string, value: unknown): void {
    if (value === undefined || value === null) return;
    if (!isTaxMoney(value)) this.add(field, "invalid_amount");
  }

  option<T extends string>(field: string, list: readonly T[], value: unknown): void {
    if (value === undefined) this.add(field, "required");
    else if (!isOneOf(list, value)) this.add(field, "invalid_option");
  }

  pattern(field: string, value: unknown, pattern: RegExp, required = false): void {
    if (value === undefined || value === "") {
      if (required) this.add(field, "required");
      return;
    }
    if (typeof value !== "string" || !pattern.test(value)) this.add(field, "invalid_format");
  }

  /** A date inside the year. `required` false lets it be absent (or `null`). */
  dateInYear(field: string, value: unknown, fy: FinancialYearKey, required: boolean): boolean {
    if (value === undefined || value === null || value === "") {
      if (required) this.add(field, "required");
      return false;
    }
    if (typeof value !== "string" || !isValidDateKey(value)) {
      this.add(field, "invalid_date");
      return false;
    }
    if (!isDateInFinancialYear(value, fy)) {
      this.add(field, "date_outside_year");
      return false;
    }
    return true;
  }

  notInFuture(field: string, value: string, ctx: TaxValidationContext): void {
    if (ctx.todayKey && value > ctx.todayKey) this.add(field, "date_in_future");
  }

  sourceRef(field: string, value: TaxSourceRef | undefined): void {
    if (value === undefined) return;
    if (!isTaxSourceKind(value?.kind)) this.add(`${field}.kind`, "invalid_option");
    if (!isValidTaxIdSegment(value?.id)) this.add(`${field}.id`, "invalid_format");
  }

  idList(field: string, value: unknown, max: number): void {
    if (value === undefined) return;
    if (!Array.isArray(value)) {
      this.add(field, "invalid_format");
      return;
    }
    if (value.length > max) this.add(field, "too_many");
    if (!value.every(isValidTaxIdSegment) || new Set(value).size !== value.length) {
      this.add(field, "invalid_format");
    }
  }

  meta(createdAtMs: unknown, updatedAtMs: unknown): void {
    if (!Number.isInteger(createdAtMs) || (createdAtMs as number) <= 0) {
      this.add("createdAtMs", "invalid_format");
    }
    if (updatedAtMs === undefined) return;
    if (!Number.isInteger(updatedAtMs) || (updatedAtMs as number) < (createdAtMs as number)) {
      this.add("updatedAtMs", "invalid_format");
    }
  }
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export interface TaxEntryDraft<K extends TaxEntryKind = TaxEntryKind> {
  fy: FinancialYearKey;
  kind: K;
  fields: TaxEntryFieldsByKind[K];
  label?: string;
  note?: string;
  documentIds?: string[];
}

type FieldValidator<K extends TaxEntryKind> = (
  issues: Issues,
  fields: TaxEntryFieldsByKind[K],
  fy: FinancialYearKey,
  ctx: TaxValidationContext
) => void;

const FIELD_VALIDATORS: { [K in TaxEntryKind]: FieldValidator<K> } = {
  income(issues, f, fy, ctx) {
    issues.option("fields.category", TAX_INCOME_CATEGORIES, f.category);
    issues.money("fields.amount", f.amount, { positive: true });
    if (issues.dateInYear("fields.date", f.date, fy, false)) {
      issues.notInFuture("fields.date", f.date as string, ctx);
    }
    issues.optionalText("fields.payer", f.payer, TAX_LIMITS.nameMax);
  },

  form16(issues, f, fy) {
    issues.requiredText("fields.employerName", f.employerName, TAX_LIMITS.nameMax);
    issues.pattern("fields.tan", f.tan, TAN_PATTERN);
    const from = issues.dateInYear("fields.periodFrom", f.periodFrom, fy, false);
    const to = issues.dateInYear("fields.periodTo", f.periodTo, fy, false);
    if (from && to && (f.periodFrom as string) > (f.periodTo as string)) {
      issues.add("fields.periodTo", "date_order");
    }
    issues.money("fields.grossSalary", f.grossSalary, { positive: true });
    issues.optionalMoney("fields.exemptAllowances", f.exemptAllowances);
    issues.optionalMoney("fields.standardDeduction", f.standardDeduction);
    issues.optionalMoney("fields.professionalTax", f.professionalTax);
    issues.optionalMoney("fields.taxableSalary", f.taxableSalary);
    issues.money("fields.tdsDeducted", f.tdsDeducted);
  },

  tds(issues, f) {
    issues.requiredText("fields.deductorName", f.deductorName, TAX_LIMITS.nameMax);
    issues.pattern("fields.tan", f.tan, TAN_PATTERN);
    issues.pattern("fields.section", f.section, TDS_SECTION_PATTERN, true);
    issues.option("fields.form", TAX_TDS_FORMS, f.form);
    if (f.quarter !== undefined) issues.option("fields.quarter", TAX_QUARTERS, f.quarter);
    issues.optionalMoney("fields.amountPaid", f.amountPaid);
    if (f.amountPaid === undefined) issues.add("fields.amountPaid", "required");
    issues.money("fields.tdsAmount", f.tdsAmount, { positive: true });
  },

  ais_value(issues, f) {
    issues.option("fields.statement", TAX_STATEMENTS, f.statement);
    issues.option("fields.infoCategory", TAX_AIS_CATEGORIES, f.infoCategory);
    issues.optionalText("fields.sourceName", f.sourceName, TAX_LIMITS.nameMax);
    issues.pattern("fields.tan", f.tan, TAN_PATTERN);
    issues.pattern("fields.section", f.section, TDS_SECTION_PATTERN);
    issues.money("fields.reportedAmount", f.reportedAmount);
    issues.optionalMoney("fields.tdsAmount", f.tdsAmount);
  },

  deduction(issues, f) {
    issues.pattern("fields.category", f.category, CATEGORY_ID_PATTERN, true);
    issues.money("fields.amount", f.amount, { positive: true });
    issues.option("fields.proofStatus", TAX_PROOF_STATUSES, f.proofStatus);
    issues.sourceRef("fields.sourceRef", f.sourceRef);
  },

  capital_gain(issues, f, fy, ctx) {
    issues.option("fields.mode", TAX_CAPITAL_GAIN_MODES, f.mode);
    issues.option("fields.assetClass", TAX_ASSET_CLASSES, f.assetClass);
    issues.requiredText("fields.assetName", f.assetName, TAX_LIMITS.nameMax);
    issues.pattern("fields.isin", f.isin, ISIN_PATTERN);
    const sold = issues.dateInYear("fields.soldDate", f.soldDate, fy, true);
    if (sold) issues.notInFuture("fields.soldDate", f.soldDate, ctx);
    issues.optionalMoney("fields.costOfAcquisition", f.costOfAcquisition);
    if (f.costOfAcquisition === undefined) issues.add("fields.costOfAcquisition", "required");
    issues.money("fields.saleValue", f.saleValue);
    issues.optionalMoney("fields.transferExpenses", f.transferExpenses);

    if (f.mode === "statement_total") {
      // A total has no single lot: per-sale fields would be invented.
      if (f.quantity != null) issues.add("fields.quantity", "not_allowed");
      if (f.acquiredDate != null) issues.add("fields.acquiredDate", "not_allowed");
      return;
    }
    if (f.quantity != null) {
      const ok = typeof f.quantity === "number" && Number.isFinite(f.quantity) && f.quantity > 0;
      if (!ok || (f.quantity as number) >= 1e12) issues.add("fields.quantity", "invalid_quantity");
    }
    if (f.acquiredDate != null) {
      if (typeof f.acquiredDate !== "string" || !isValidDateKey(f.acquiredDate)) {
        issues.add("fields.acquiredDate", "invalid_date");
      } else if (sold && f.acquiredDate > f.soldDate) {
        issues.add("fields.acquiredDate", "date_order");
      }
    }
  },

  tax_payment(issues, f, fy, ctx) {
    issues.option("fields.paymentType", TAX_PAYMENT_TYPES, f.paymentType);
    issues.money("fields.amount", f.amount, { positive: true });
    issues.pattern("fields.bsrCode", f.bsrCode, BSR_PATTERN);
    issues.pattern("fields.challanSerial", f.challanSerial, CHALLAN_SERIAL_PATTERN);
    issues.pattern("fields.cin", f.cin, CIN_PATTERN);

    if (f.paymentType === "advance_tax") {
      // Advance tax is paid during the year it is for.
      if (issues.dateInYear("fields.date", f.date, fy, true)) {
        issues.notInFuture("fields.date", f.date, ctx);
      }
      return;
    }
    // Self-assessment (and other) tax is paid for the year, usually after it ends.
    if (!f.date) issues.add("fields.date", "required");
    else if (typeof f.date !== "string" || !isValidDateKey(f.date)) {
      issues.add("fields.date", "invalid_date");
    } else {
      const bounds = financialYearDateBounds(fy);
      if (bounds && f.date < bounds.startDate) issues.add("fields.date", "date_before_year");
      issues.notInFuture("fields.date", f.date, ctx);
    }
  },
};

export function validateTaxEntry(
  draft: TaxEntryDraft,
  ctx: TaxValidationContext = {}
): TaxIssue[] {
  const issues = new Issues();
  if (!isFinancialYearKey(draft.fy)) issues.add("fy", "invalid_year");
  if (!isOneOf(TAX_ENTRY_KINDS, draft.kind)) {
    issues.add("kind", "invalid_option");
    return issues.list;
  }
  if (!draft.fields || typeof draft.fields !== "object") {
    issues.add("fields", "required");
    return issues.list;
  }
  issues.optionalText("label", draft.label, TAX_LIMITS.labelMax);
  issues.optionalText("note", draft.note, TAX_LIMITS.noteMax);
  issues.idList("documentIds", draft.documentIds, TAX_LIMITS.maxDocumentIds);
  if (isFinancialYearKey(draft.fy)) {
    (FIELD_VALIDATORS[draft.kind] as FieldValidator<TaxEntryKind>)(
      issues,
      draft.fields,
      draft.fy,
      ctx
    );
  }
  return issues.list;
}

// ---------------------------------------------------------------------------
// Reviews, profiles, documents
// ---------------------------------------------------------------------------

const CHECKLIST_DECISIONS = new Set(["confirm", "defer", "resolve"]);

export function validateTaxReview(review: Omit<TaxReview, "id">): TaxIssue[] {
  const issues = new Issues();
  if (!isFinancialYearKey(review.fy)) issues.add("fy", "invalid_year");
  issues.option("sourceKind", TAX_SOURCE_KINDS, review.sourceKind);
  if (!isValidTaxIdSegment(review.sourceId)) issues.add("sourceId", "invalid_format");
  issues.option("decision", TAX_REVIEW_DECISIONS, review.decision);

  const isChecklist = review.sourceKind === "checklist";
  if (isChecklist && !CHECKLIST_DECISIONS.has(review.decision)) issues.add("decision", "not_allowed");
  // SPENDLY-291: a reconciliation row can only have its difference accepted.
  if (review.sourceKind === "reconciliation" && review.decision !== "confirm") issues.add("decision", "not_allowed");
  if (!isChecklist && (review.decision === "defer" || review.decision === "resolve")) {
    issues.add("decision", "not_allowed");
  }
  if (review.decision === "recategorize") {
    issues.pattern("category", review.category, CATEGORY_ID_PATTERN, true);
  } else if (review.category !== undefined) {
    issues.add("category", "not_allowed");
  }
  if (review.decision === "replace") {
    if (!isValidTaxIdSegment(review.replacedBy)) issues.add("replacedBy", "required");
  } else if (review.replacedBy !== undefined) {
    issues.add("replacedBy", "not_allowed");
  }
  if (isChecklist) {
    if (review.sourceAmount !== null) issues.add("sourceAmount", "not_allowed");
  } else if (review.sourceAmount !== null && !isTaxMoney(review.sourceAmount)) {
    issues.add("sourceAmount", "invalid_amount");
  }
  issues.optionalText("note", review.note, TAX_LIMITS.noteMax);
  if (!Number.isInteger(review.revision) || review.revision < 1) {
    issues.add("revision", "invalid_format");
  }
  if ((review.history?.length ?? 0) > TAX_LIMITS.historyLimit) issues.add("history", "too_many");
  issues.meta(review.createdAtMs, review.updatedAtMs);
  return issues.list;
}

export function validateTaxProfile(profile: Omit<TaxProfile, "id">): TaxIssue[] {
  const issues = new Issues();
  if (!isFinancialYearKey(profile.fy)) issues.add("fy", "invalid_year");
  issues.option("residentialStatus", TAX_RESIDENTIAL_STATUSES, profile.residentialStatus);
  issues.option("ageBand", TAX_AGE_BANDS, profile.ageBand);
  if (profile.regimeNote !== undefined) {
    issues.option("regimeNote", TAX_REGIME_NOTES, profile.regimeNote);
  }
  if (profile.employerCount !== undefined) {
    const n = profile.employerCount;
    if (!Number.isInteger(n) || n < 0 || n > TAX_LIMITS.maxEmployers) {
      issues.add("employerCount", "invalid_format");
    }
  }
  issues.optionalText("note", profile.note, TAX_LIMITS.noteMax);
  issues.meta(profile.createdAtMs, profile.updatedAtMs);
  return issues.list;
}

/** Same types and size cap as account documents (`shared/utils/accountDocuments.ts`). */
export const TAX_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const TAX_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export function validateTaxDocument(uid: string, doc: TaxDocument): TaxIssue[] {
  const issues = new Issues();
  if (!isValidTaxIdSegment(doc.id)) issues.add("id", "invalid_format");
  if (!isFinancialYearKey(doc.fy)) issues.add("fy", "invalid_year");
  issues.option("category", TAX_DOCUMENT_CATEGORIES, doc.category);
  issues.requiredText("name", doc.name, TAX_LIMITS.nameMax);
  issues.optionalText("note", doc.note, TAX_LIMITS.noteMax);
  issues.requiredText("fileName", doc.fileName, TAX_LIMITS.nameMax);
  if (!isOwnTaxStoragePath(uid, doc.id, doc.storagePath)) issues.add("storagePath", "not_owner");
  issues.option("mimeType", TAX_DOCUMENT_MIME_TYPES, doc.mimeType);
  if (
    !Number.isInteger(doc.sizeBytes) ||
    doc.sizeBytes <= 0 ||
    doc.sizeBytes > TAX_DOCUMENT_MAX_BYTES
  ) {
    issues.add("sizeBytes", "invalid_format");
  }
  issues.option("status", TAX_DOCUMENT_STATUSES, doc.status);
  issues.idList("entryIds", doc.entryIds, TAX_LIMITS.maxDocumentIds);
  issues.meta(doc.createdAtMs, doc.updatedAtMs);
  return issues.list;
}

/** Most output figures one snapshot may hold. Mirrored by firestore.rules. */
export const TAX_SNAPSHOT_MAX_OUTPUTS = 100;
const SNAPSHOT_OUTPUT_KEY = /^[a-zA-Z0-9_.]{1,60}$/;

export function validateTaxSnapshot(snapshot: TaxSnapshot): TaxIssue[] {
  const issues = new Issues();
  if (!isFinancialYearKey(snapshot.fy)) issues.add("fy", "invalid_year");
  else if (snapshot.id !== taxSnapshotDocId(snapshot.fy, snapshot.createdAtMs)) {
    issues.add("id", "invalid_format");
  }
  issues.option("law", TAX_LAWS, snapshot.law);
  issues.option("reason", TAX_SNAPSHOT_REASONS, snapshot.reason);
  issues.requiredText("ruleVersion", snapshot.ruleVersion, 40);
  issues.requiredText("inputHash", snapshot.inputHash, 128);
  const outputs = snapshot.outputs;
  if (!outputs || typeof outputs !== "object" || Array.isArray(outputs)) {
    issues.add("outputs", "required");
  } else {
    const keys = Object.keys(outputs);
    if (keys.length > TAX_SNAPSHOT_MAX_OUTPUTS) issues.add("outputs", "too_many");
    for (const key of keys) {
      const value = outputs[key];
      // Outputs may be negative (a refund due); unknown stays null.
      const ok = value === null || (typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= TAX_LIMITS.maxAmount);
      if (!SNAPSHOT_OUTPUT_KEY.test(key) || !ok) issues.add(`outputs.${key}`, "invalid_format");
    }
  }
  if (!Number.isInteger(snapshot.unresolvedCount) || snapshot.unresolvedCount < 0) {
    issues.add("unresolvedCount", "invalid_format");
  }
  issues.meta(snapshot.createdAtMs, undefined);
  return issues.list;
}
