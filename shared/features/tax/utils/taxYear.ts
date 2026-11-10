/**
 * SPENDLY-289 — financial year, assessment year and tax year.
 *
 * Every screen renders a year through `taxYearLabel`, so FY/AY wording can't
 * drift between screens or be mixed across the 2026 change of law.
 */

import { financialYearOfDate, financialYearOfMonth } from "@/shared/utils/financialYear";
import { isValidDateKey } from "@/shared/utils/dates";
import { ITA2025_FIRST_START_YEAR, TAX_CENTER_FIRST_FY } from "../data/taxYears";
import type { FinancialYearKey, TaxLaw, TaxYear } from "../types";

const FY_PATTERN = /^(\d{4})-(\d{2})$/;

/** "2025-26" is valid; "2025-27", "2025-6" and "FY 2025-26" are not. */
export function isFinancialYearKey(value: unknown): value is FinancialYearKey {
  if (typeof value !== "string") return false;
  const match = FY_PATTERN.exec(value);
  if (!match) return false;
  const start = Number(match[1]);
  return start >= 1900 && Number(match[2]) === (start + 1) % 100;
}

function startYearOf(fy: FinancialYearKey): number {
  return Number(fy.slice(0, 4));
}

/** "2025-26" -> "2026-27". Empty string when malformed. */
export function nextFinancialYear(fy: FinancialYearKey): FinancialYearKey {
  if (!isFinancialYearKey(fy)) return "";
  return financialYearOfMonth(`${startYearOf(fy) + 1}-04`);
}

/** "2025-26" -> "2024-25". Empty string when malformed. */
export function previousFinancialYear(fy: FinancialYearKey): FinancialYearKey {
  if (!isFinancialYearKey(fy)) return "";
  return financialYearOfMonth(`${startYearOf(fy) - 1}-04`);
}

export function taxLawOf(fy: FinancialYearKey): TaxLaw | null {
  if (!isFinancialYearKey(fy)) return null;
  return startYearOf(fy) >= ITA2025_FIRST_START_YEAR ? "ITA2025" : "ITA1961";
}

/**
 * Assessment year of a financial year under the 1961 Act ("2025-26" ->
 * "2026-27"). `null` from FY 2026-27: the 2025 Act has no assessment year.
 */
export function assessmentYearOf(fy: FinancialYearKey): FinancialYearKey | null {
  return taxLawOf(fy) === "ITA1961" ? nextFinancialYear(fy) : null;
}

/** Inclusive date bounds: "2025-26" -> 2025-04-01 … 2026-03-31. */
export function financialYearDateBounds(
  fy: FinancialYearKey
): { startDate: string; endDate: string } | null {
  if (!isFinancialYearKey(fy)) return null;
  const start = startYearOf(fy);
  return { startDate: `${start}-04-01`, endDate: `${start + 1}-03-31` };
}

export function taxYearOf(fy: FinancialYearKey): TaxYear | null {
  const law = taxLawOf(fy);
  const bounds = financialYearDateBounds(fy);
  if (!law || !bounds) return null;
  return { fy, law, ay: assessmentYearOf(fy), ...bounds };
}

export function isDateInFinancialYear(dateKey: string, fy: FinancialYearKey): boolean {
  return isValidDateKey(dateKey) && financialYearOfDate(dateKey) === fy;
}

export type TaxYearLabelStyle = "short" | "long";

/**
 * The only way a screen names a year.
 *   1961 Act, short: "FY 2025-26"   long: "FY 2025-26 · AY 2026-27"
 *   2025 Act, both:  "Tax year 2026-27"
 */
export function taxYearLabel(fy: FinancialYearKey, style: TaxYearLabelStyle = "long"): string {
  const law = taxLawOf(fy);
  if (!law) return "";
  if (law === "ITA2025") return `Tax year ${fy}`;
  return style === "short" ? `FY ${fy}` : `FY ${fy} · AY ${assessmentYearOf(fy)}`;
}

/** The year a date falls in, e.g. today -> the current year. Empty string when malformed. */
export function financialYearForDate(dateKey: string): FinancialYearKey {
  return isValidDateKey(dateKey) ? financialYearOfDate(dateKey) : "";
}

/**
 * Years the tax center offers, newest first: the current year back to
 * `TAX_CENTER_FIRST_FY`. Filing for a year happens after it ends, so the
 * previous year is usually the one being prepared.
 */
export function selectableTaxYears(todayKey: string): FinancialYearKey[] {
  const current = financialYearForDate(todayKey);
  if (!current) return [];
  const years: FinancialYearKey[] = [];
  for (
    let fy = current;
    fy && startYearOf(fy) >= startYearOf(TAX_CENTER_FIRST_FY);
    fy = previousFinancialYear(fy)
  ) {
    years.push(fy);
  }
  return years;
}

/** The year a return is most likely being prepared for: the one that ended last. */
export function defaultTaxYear(todayKey: string): FinancialYearKey {
  const current = financialYearForDate(todayKey);
  if (!current) return "";
  const previous = previousFinancialYear(current);
  return startYearOf(previous) >= startYearOf(TAX_CENTER_FIRST_FY) ? previous : current;
}
