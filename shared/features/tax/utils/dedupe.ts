/**
 * SPENDLY-289 — duplicate detection for tax entries.
 *
 * Two entries with the same key are probably the same fact typed twice. That
 * is a warning, not a block: the user can confirm "not a duplicate"
 * (`duplicateConfirmed`), and nothing is ever merged or removed automatically.
 */

import type { TaxEntry, TaxEntryFieldsByKind, TaxEntryKind } from "../types";
import type { TaxEntryDraft } from "./validation";

/** Lower case, letters and digits only, single spaces. "  ABC Ltd. " -> "abc ltd". */
export function normalizeTaxText(value: string | undefined | null): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function money(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "";
}

/** A TAN identifies the deductor better than a typed name; fall back to the name. */
function party(tan: string | undefined, name: string | undefined): string {
  return tan ? tan.toUpperCase() : normalizeTaxText(name);
}

const KEY_PARTS: { [K in TaxEntryKind]: (f: TaxEntryFieldsByKind[K]) => string[] } = {
  income: (f) => [f.category, f.date ?? "", money(f.amount), normalizeTaxText(f.payer)],
  // One Form 16 per employer (and period, for a job change within the year).
  form16: (f) => [party(f.tan, f.employerName), f.periodFrom ?? "", f.periodTo ?? ""],
  tds: (f) => [
    party(f.tan, f.deductorName),
    normalizeTaxText(f.section),
    f.quarter ?? "",
    money(f.tdsAmount),
  ],
  ais_value: (f) => [
    f.statement,
    f.infoCategory,
    party(f.tan, f.sourceName),
    normalizeTaxText(f.section),
    money(f.reportedAmount),
  ],
  deduction: (f) =>
    f.sourceRef
      ? [f.category, `${f.sourceRef.kind}:${f.sourceRef.id}`]
      : [f.category, money(f.amount)],
  capital_gain: (f) =>
    f.mode === "statement_total"
      ? ["total", f.assetClass]
      : [
          "row",
          f.isin || normalizeTaxText(f.assetName),
          f.soldDate,
          f.quantity == null ? "" : String(f.quantity),
          money(f.saleValue),
        ],
  // A challan (BSR + serial + date) is unique; without one, type + date + amount.
  tax_payment: (f) =>
    f.bsrCode && f.challanSerial
      ? ["challan", f.bsrCode, f.challanSerial, f.date]
      : [f.paymentType, f.date, money(f.amount)],
};

export function taxEntryDedupeKey(draft: Pick<TaxEntryDraft, "fy" | "kind" | "fields">): string {
  const parts = (KEY_PARTS[draft.kind] as (f: unknown) => string[])(draft.fields);
  return [draft.fy, draft.kind, ...parts].join("|");
}

/**
 * Groups of live entries that share a key, oldest first. Keeping a copy
 * sets `duplicateConfirmed` on it, so a group is reported only while two or
 * more of its entries are unconfirmed (the first one never needs confirming).
 */
export function findDuplicateTaxEntries(entries: readonly TaxEntry[]): TaxEntry[][] {
  const byKey = new Map<string, TaxEntry[]>();
  for (const entry of entries) {
    if (entry.deletedAt) continue;
    const group = byKey.get(entry.dedupeKey);
    if (group) group.push(entry);
    else byKey.set(entry.dedupeKey, [entry]);
  }
  const groups: TaxEntry[][] = [];
  for (const group of byKey.values()) {
    if (group.filter((e) => !e.duplicateConfirmed).length < 2) continue;
    groups.push([...group].sort((a, b) => a.createdAtMs - b.createdAtMs));
  }
  return groups;
}
