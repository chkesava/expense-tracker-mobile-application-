/**
 * SPENDLY-109 — how the Journal's month pill and its date-range filter compose.
 *
 * The Journal has always been scoped by the global month pill. The ticket adds
 * a From/To range, and the two would otherwise fight: a range that reaches
 * outside the selected month could never match anything.
 *
 * The agreed rule is **the range overrides the month**. Setting either date
 * takes over; clearing both hands scope back to the pill. Expressing that as a
 * total function keeps "clearing filters restores the complete view" literally
 * true rather than something the screen has to remember to re-derive.
 */

import { daysInMonth, isValidMonthKey } from "./dates";

export interface JournalDateScope {
  /** `""` when unscoped. Fed straight into `AccountActivityFilters.fromDate`. */
  fromDate: string;
  toDate: string;
  /** True when an explicit range replaced the month pill. */
  monthOverridden: boolean;
  /** The month the pill still displays, override or not. */
  monthKey: string;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function resolveJournalDateScope(
  monthKey: string | undefined,
  filters: { fromDate: string; toDate: string }
): JournalDateScope {
  const from = filters.fromDate.trim();
  const to = filters.toDate.trim();
  const month = monthKey?.trim() ?? "";

  // An explicit range wins, and is used verbatim. A one-sided range stays
  // open-ended on purpose: clamping "everything since Jan 2024" to the selected
  // month would silently turn it into "Jan 2024, but only in March".
  if (from || to) {
    return { fromDate: from, toDate: to, monthOverridden: true, monthKey: month };
  }

  if (isValidMonthKey(month)) {
    const [yearRaw, monthRaw] = month.split("-");
    const last = daysInMonth(Number(yearRaw), Number(monthRaw) - 1);
    return {
      fromDate: `${month}-01`,
      toDate: `${month}-${pad2(last)}`,
      monthOverridden: false,
      monthKey: month,
    };
  }

  // No month and no range — the whole ledger, which is what an absent or
  // malformed month key should mean rather than an error.
  return { fromDate: "", toDate: "", monthOverridden: false, monthKey: month };
}
