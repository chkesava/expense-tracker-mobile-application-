/**
 * SPENDLY-290 — the "add income" form, pure: text in, validated fields out,
 * plus a duplicate check before saving. The store validates again.
 */

import { roundMoney } from "@/shared/utils/money";
import {
  TAX_INCOME_CATEGORIES,
  type FinancialYearKey,
  type TaxEntry,
  type TaxEntryOf,
  type TaxIncomeCategory,
  type TaxIncomeFields,
} from "../types";
import { taxEntryDedupeKey } from "./dedupe";
import { validateTaxEntry, type TaxIssue } from "./validation";

export interface IncomeEntryForm {
  category: TaxIncomeCategory | "";
  amount: string;
  /** YYYY-MM-DD or "" for an annual total. */
  date: string;
  payer: string;
  note: string;
}

export const EMPTY_INCOME_ENTRY_FORM: IncomeEntryForm = { category: "", amount: "", date: "", payer: "", note: "" };

/**
 * Categories a user adds income under. Not "not income", and not capital
 * gains, which have their own screen (SPENDLY-293).
 */
export const INCOME_ENTRY_CATEGORIES: readonly TaxIncomeCategory[] = TAX_INCOME_CATEGORIES.filter(
  (c) => c !== "not_income" && c !== "capital_gain"
);

/** "1,23,456.50" -> 123456.5. `null` for empty or non-numeric text. */
export function parseTaxAmount(text: string): number | null {
  const cleaned = text.replace(/[,\s₹]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? roundMoney(value) : null;
}

export function incomeFormFromEntry(entry: TaxEntryOf<"income">): IncomeEntryForm {
  return {
    category: entry.fields.category,
    amount: String(entry.fields.amount),
    date: entry.fields.date ?? "",
    payer: entry.fields.payer ?? "",
    note: entry.note ?? "",
  };
}

export function incomeFormToFields(
  form: IncomeEntryForm,
  fy: FinancialYearKey,
  todayKey: string
): { fields: TaxIncomeFields | null; issues: TaxIssue[] } {
  const amount = parseTaxAmount(form.amount);
  const fields = {
    // Left out when unpicked, so it reads as "needed" rather than "not a choice".
    ...(form.category ? { category: form.category } : {}),
    amount: amount ?? Number.NaN,
    ...(form.date ? { date: form.date } : {}),
    ...(form.payer.trim() ? { payer: form.payer.trim() } : {}),
  } as TaxIncomeFields;
  const issues = validateTaxEntry(
    { fy, kind: "income", fields, note: form.note.trim() || undefined },
    { todayKey }
  );
  if (amount === null) {
    const rest = issues.filter((i) => i.field !== "fields.amount");
    return { fields: null, issues: [{ field: "fields.amount", code: "required" }, ...rest] };
  }
  return { fields: issues.length === 0 ? fields : null, issues };
}

/** A live entry that looks like the same income typed again (not the one being edited). */
export function duplicateIncomeEntry(
  fields: TaxIncomeFields,
  fy: FinancialYearKey,
  entries: readonly TaxEntry[],
  editingId?: string
): TaxEntry | undefined {
  const key = taxEntryDedupeKey({ fy, kind: "income", fields });
  return entries.find((e) => !e.deletedAt && e.id !== editingId && e.dedupeKey === key);
}
