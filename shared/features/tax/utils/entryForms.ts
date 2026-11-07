/**
 * SPENDLY-291 — forms for tax records, described as data so one sheet renders
 * them all: Form 16, TDS certificates and AIS/TIS/26AS lines here; deductions,
 * payments and capital gains reuse it in their stories.
 *
 * Text in, a validated draft out. Empty optional amounts are left out, and an
 * amount the form calls "unknown" is stored as `null`, never 0 (SPENDLY-289).
 */

import { DEDUCTION_CATEGORIES } from "../data/deductionCategories";
import {
  TAX_AIS_CATEGORIES,
  TAX_PROOF_STATUSES,
  TAX_QUARTERS,
  TAX_STATEMENTS,
  TAX_TDS_FORMS,
  type FinancialYearKey,
  type TaxEntry,
  type TaxEntryKind,
} from "../types";
import { isTaxSourceKind, isValidTaxIdSegment } from "./ids";
import { taxEntryDedupeKey } from "./dedupe";
import { parseTaxAmount } from "./incomeEntryForm";
import { validateTaxEntry, type TaxEntryDraft, type TaxIssue } from "./validation";

/**
 * `sourceRef` links an existing Spendly record (SPENDLY-292): its options are
 * supplied at runtime (`"{kind}:{id}"`) and it is stored as `{ kind, id }`.
 */
export type FormFieldType = "text" | "money" | "date" | "tan" | "section" | "option" | "sourceRef";

export interface FormField {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  /** Money only: an empty value is stored as `null` ("not known") rather than left out. */
  nullable?: boolean;
  options?: readonly { id: string; label: string }[];
  placeholder?: string;
  helper?: string;
}

export interface EntryFormSpec {
  kind: TaxEntryKind;
  title: string;
  fields: readonly FormField[];
  /** Fills fields the user may leave to the form (after parsing, before validation). */
  complete?: (fields: Record<string, unknown>, extra: { documentIds?: string[] }) => void;
}

const opt = (ids: readonly string[], label: (id: string) => string = (id) => id) => ids.map((id) => ({ id, label: label(id) }));

const AIS_CATEGORY_LABELS: Record<string, string> = {
  salary: "Salary",
  interest: "Interest",
  dividend: "Dividend",
  rent: "Rent",
  securities_sale: "Sale of shares",
  mutual_fund_sale: "Sale of mutual funds",
  tds: "TDS",
  tcs: "TCS",
  tax_paid: "Tax paid",
  other: "Other",
};

const TAN_HELPER = "10 characters on the certificate, e.g. MUMS98765C. Needed to compare with your AIS or 26AS.";

export const ENTRY_FORMS: Partial<Record<TaxEntryKind, EntryFormSpec>> = {
  form16: {
    kind: "form16",
    title: "Form 16",
    fields: [
      { key: "employerName", label: "Employer", type: "text", required: true, placeholder: "As on Form 16" },
      { key: "tan", label: "Employer TAN", type: "tan", required: false, helper: TAN_HELPER },
      { key: "periodFrom", label: "Employed from (optional)", type: "date", required: false },
      { key: "periodTo", label: "Employed to (optional)", type: "date", required: false },
      { key: "grossSalary", label: "Gross salary", type: "money", required: true, helper: "Part B: gross salary before exemptions and deductions." },
      { key: "exemptAllowances", label: "Exempt allowances (optional)", type: "money", required: false, nullable: true },
      { key: "standardDeduction", label: "Standard deduction (optional)", type: "money", required: false, nullable: true },
      { key: "professionalTax", label: "Professional tax (optional)", type: "money", required: false, nullable: true },
      { key: "taxableSalary", label: "Taxable salary (optional)", type: "money", required: false, nullable: true },
      { key: "tdsDeducted", label: "Tax deducted (TDS)", type: "money", required: true, helper: "Part A: total tax deducted." },
    ],
  },
  tds: {
    kind: "tds",
    title: "TDS certificate",
    fields: [
      { key: "deductorName", label: "Deducted by", type: "text", required: true, placeholder: "e.g. bank, client" },
      { key: "tan", label: "Deductor TAN", type: "tan", required: false, helper: TAN_HELPER },
      { key: "form", label: "Certificate", type: "option", required: true, options: opt(TAX_TDS_FORMS, (id) => (id === "other" ? "Other" : `Form ${id}`)) },
      { key: "section", label: "Section", type: "section", required: true, placeholder: "e.g. 194A", helper: "As printed on the certificate." },
      { key: "quarter", label: "Quarter (optional)", type: "option", required: false, options: opt(TAX_QUARTERS) },
      { key: "amountPaid", label: "Amount paid or credited", type: "money", required: true, nullable: true, helper: "Leave empty if the certificate doesn't say." },
      { key: "tdsAmount", label: "Tax deducted", type: "money", required: true },
    ],
  },
  deduction: {
    kind: "deduction",
    title: "Deduction",
    fields: [
      { key: "category", label: "What you're claiming", type: "option", required: true, options: DEDUCTION_CATEGORIES.map((cat) => ({ id: cat.id, label: cat.label })) },
      { key: "amount", label: "Amount for this year", type: "money", required: true, helper: "What you paid or invested in this year, as on the proof." },
      { key: "sourceRef", label: "Based on a Spendly record (optional)", type: "sourceRef", required: false, helper: "Linked, not copied: the amount stays what you enter." },
      { key: "proofStatus", label: "Proof (optional)", type: "option", required: false, options: opt(TAX_PROOF_STATUSES, (id) => ({ attached: "Attached", missing: "Still to get", not_needed: "Not needed" })[id] ?? id) },
    ],
    // Proof status follows the attachments unless the user picked one.
    complete: (fields, extra) => {
      if (!fields.proofStatus) fields.proofStatus = extra.documentIds?.length ? "attached" : "missing";
    },
  },
  ais_value: {
    kind: "ais_value",
    title: "AIS / 26AS line",
    fields: [
      { key: "statement", label: "Statement", type: "option", required: true, options: opt(TAX_STATEMENTS) },
      { key: "infoCategory", label: "What it reports", type: "option", required: true, options: opt(TAX_AIS_CATEGORIES, (id) => AIS_CATEGORY_LABELS[id] ?? id) },
      { key: "sourceName", label: "Reported by (optional)", type: "text", required: false, placeholder: "Name as shown" },
      { key: "tan", label: "TAN (optional)", type: "tan", required: false, helper: TAN_HELPER },
      { key: "section", label: "Section (optional)", type: "section", required: false },
      { key: "reportedAmount", label: "Amount reported", type: "money", required: true, helper: "Amount paid or credited, as shown." },
      { key: "tdsAmount", label: "Tax deducted (optional)", type: "money", required: false, nullable: true },
    ],
  },
};

export type EntryFormValues = Record<string, string>;

export function emptyEntryForm(spec: EntryFormSpec): EntryFormValues {
  return Object.fromEntries(spec.fields.map((f) => [f.key, ""]));
}

export function entryToForm(spec: EntryFormSpec, entry: TaxEntry): EntryFormValues {
  const fields = entry.fields as unknown as Record<string, unknown>;
  return Object.fromEntries(
    spec.fields.map((f) => {
      const v = fields[f.key];
      if (f.type === "sourceRef" && v && typeof v === "object") {
        const ref = v as { kind?: string; id?: string };
        return [f.key, `${ref.kind}:${ref.id}`];
      }
      return [f.key, v === null || v === undefined ? "" : String(v)];
    })
  );
}

/** Field labels keyed as issues name them ("fields.grossSalary"), for messages. */
export function entryFormLabels(spec: EntryFormSpec): Record<string, string> {
  return Object.fromEntries(spec.fields.map((f) => [`fields.${f.key}`, f.label.replace(/ \(optional\)$/, "")]));
}

export function entryFormToDraft(
  spec: EntryFormSpec,
  values: EntryFormValues,
  fy: FinancialYearKey,
  extra: { note?: string; documentIds?: string[] },
  todayKey: string
): { draft: TaxEntryDraft | null; issues: TaxIssue[] } {
  const fields: Record<string, unknown> = {};
  const issues: TaxIssue[] = [];
  for (const f of spec.fields) {
    const raw = (values[f.key] ?? "").trim();
    if (f.type === "money") {
      if (!raw) {
        if (f.nullable) fields[f.key] = null;
        continue;
      }
      const amount = parseTaxAmount(raw);
      if (amount === null) issues.push({ field: `fields.${f.key}`, code: "invalid_amount" });
      else fields[f.key] = amount;
      continue;
    }
    if (!raw) continue;
    if (f.type === "sourceRef") {
      const at = raw.indexOf(":");
      const kind = raw.slice(0, at);
      const id = raw.slice(at + 1);
      if (at <= 0 || !isTaxSourceKind(kind) || !isValidTaxIdSegment(id)) issues.push({ field: `fields.${f.key}`, code: "invalid_format" });
      else fields[f.key] = { kind, id };
      continue;
    }
    fields[f.key] = f.type === "tan" || f.type === "section" ? raw.replace(/\s+/g, "").toUpperCase() : raw;
  }
  spec.complete?.(fields, extra);
  const draft: TaxEntryDraft = {
    fy,
    kind: spec.kind,
    fields: fields as unknown as TaxEntryDraft["fields"],
    ...(extra.note?.trim() ? { note: extra.note.trim() } : {}),
    ...(extra.documentIds?.length ? { documentIds: extra.documentIds } : {}),
  };
  issues.push(...validateTaxEntry(draft, { todayKey }).filter((i) => !issues.some((j) => j.field === i.field)));
  return { draft: issues.length === 0 ? draft : null, issues };
}

/** A live entry that looks like the same record typed again (not the one being edited). */
export function duplicateTaxEntry(
  draft: TaxEntryDraft,
  entries: readonly TaxEntry[],
  editingId?: string
): TaxEntry | undefined {
  const key = taxEntryDedupeKey(draft);
  return entries.find((e) => !e.deletedAt && e.id !== editingId && e.dedupeKey === key);
}
