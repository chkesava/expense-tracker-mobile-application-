/**
 * Indian financial year helpers — April to March.
 *
 * Deliberately generic rather than EPF-specific: KAN-70 (EPF interest, declared
 * per financial year) and KAN-71 (reporting) both need the same bucketing, and
 * a second copy would drift.
 *
 * A financial year is labelled by the calendar year it starts in plus the
 * two-digit year it ends in: April 2021 through March 2022 is "2021-22".
 */

import { isValidMonthKey, shiftMonthKey } from "@/shared/utils/dates";

/** First month (1-indexed) of the Indian financial year. */
const FY_START_MONTH = 4;

/** "2021-06" -> "2021-22"; "2022-03" -> "2021-22". Empty string when malformed. */
export function financialYearOfMonth(monthKey: string): string {
  if (!isValidMonthKey(monthKey)) return "";
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const startYear = month >= FY_START_MONTH ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** "2021-22" -> "FY 2021-22". */
export function financialYearLabel(financialYear: string): string {
  return financialYear ? `FY ${financialYear}` : "";
}

/** First and last month keys of a financial year. */
export function financialYearBounds(
  financialYear: string
): { startMonth: string; endMonth: string } | null {
  const startYear = Number(financialYear.slice(0, 4));
  if (!Number.isFinite(startYear) || financialYear.length < 7) return null;
  return {
    startMonth: `${startYear}-${String(FY_START_MONTH).padStart(2, "0")}`,
    endMonth: `${startYear + 1}-03`,
  };
}

/** The twelve month keys of a financial year, April first. */
export function financialYearMonths(financialYear: string): string[] {
  const bounds = financialYearBounds(financialYear);
  if (!bounds) return [];
  return Array.from({ length: 12 }, (_, index) => shiftMonthKey(bounds.startMonth, index));
}

/** Chronological sort comparator. Negative when `a` precedes `b`. */
export function compareFinancialYears(a: string, b: string): number {
  return Number(a.slice(0, 4)) - Number(b.slice(0, 4));
}
