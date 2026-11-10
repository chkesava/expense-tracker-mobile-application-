/**
 * SPENDLY-297 — tax deadlines for each financial year, as data. The calendar,
 * reminders and notifications read only from here; no screen hard-codes a
 * date. A change is a new `version` with its source.
 *
 * Checked on 2026-11-08:
 * - FY 2025-26 (AY 2026-27), Income-tax Act 1961:
 *   - incometax.gov.in, "Income Tax Returns" help: original return 31 July
 *     2026 (31 August for some non-audit cases), belated return by
 *     31 December 2026, revised return by 31 March 2027.
 *   - incometaxindia.gov.in, Rule 31 / Form 16: issued by 15 June after the
 *     year.
 *   - s.211: advance tax 15 June, 15 September, 15 December, 15 March.
 * - Tax year 2026-27, Income-tax Act 2025: advance tax on the same four dates
 *   (s.408, per published summaries of the Act). Filing dates for 2026-27 are
 *   added once they're checked against an official source.
 *
 * Ids are part of event ids and notification ids: never rename one.
 */

import type { FinancialYearKey, TaxLaw } from "../types";

export type TaxDeadlineKind = "advance_tax" | "year_end" | "form16" | "itr_due" | "belated_return" | "revised_return";

export interface TaxDeadline {
  /** Stable within the year, e.g. "advance-2". */
  id: string;
  kind: TaxDeadlineKind;
  /** YYYY-MM-DD. */
  date: string;
  title: string;
  detail: string;
  /** Advance tax only: the share of the year's tax due by this date. */
  cumulativePercent?: number;
}

export interface TaxDeadlineSet {
  fy: FinancialYearKey;
  law: TaxLaw;
  version: string;
  sources: readonly { label: string; url: string; checked: string }[];
  deadlines: readonly TaxDeadline[];
}

const advance = (fy: string, start: number, end: number): TaxDeadline[] => [
  { id: "advance-1", kind: "advance_tax", date: `${start}-06-15`, cumulativePercent: 15, title: "Advance tax: 1st instalment", detail: `At least 15% of the year's tax, if you owe ₹10,000 or more after TDS (${fy}).` },
  { id: "advance-2", kind: "advance_tax", date: `${start}-09-15`, cumulativePercent: 45, title: "Advance tax: 2nd instalment", detail: `At least 45% of the year's tax in total (${fy}).` },
  { id: "advance-3", kind: "advance_tax", date: `${start}-12-15`, cumulativePercent: 75, title: "Advance tax: 3rd instalment", detail: `At least 75% of the year's tax in total (${fy}).` },
  { id: "advance-4", kind: "advance_tax", date: `${end}-03-15`, cumulativePercent: 100, title: "Advance tax: last instalment", detail: `The rest of the year's tax (${fy}).` },
];

export const TAX_DEADLINE_SETS: readonly TaxDeadlineSet[] = [
  {
    fy: "2025-26",
    law: "ITA1961",
    version: "FY2025-26-d1",
    sources: [
      { label: "Income Tax Department: Income Tax Returns", url: "https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/income-tax-returns", checked: "2026-11-08" },
      { label: "Income Tax Department: Form 16 and Form 16A", url: "https://wm.incometaxindia.gov.in/w/form-16-and-form-16a", checked: "2026-11-08" },
    ],
    deadlines: [
      ...advance("FY 2025-26", 2025, 2026),
      { id: "year-end", kind: "year_end", date: "2026-03-31", title: "Last day of FY 2025-26", detail: "Tax-saving investments and payments for this year must be made by today." },
      { id: "form16", kind: "form16", date: "2026-06-15", title: "Form 16 due from your employer", detail: "Employers issue Form 16 for FY 2025-26 by today. Add it in Spendly when you have it." },
      { id: "itr-due", kind: "itr_due", date: "2026-07-31", title: "Income tax return due (AY 2026-27)", detail: "For individuals without an audit. Some non-audit cases have until 31 August: check yours." },
      { id: "belated", kind: "belated_return", date: "2026-12-31", title: "Last date for a belated return (AY 2026-27)", detail: "If you missed the due date. A late fee may apply." },
      { id: "revised", kind: "revised_return", date: "2027-03-31", title: "Last date to revise your return (AY 2026-27)", detail: "To correct a return already filed. A fee applies after 31 December." },
    ],
  },
  {
    fy: "2026-27",
    law: "ITA2025",
    version: "TY2026-27-d1",
    sources: [{ label: "Income-tax Act, 2025, s.408 (advance tax instalments)", url: "https://www.incometaxindia.gov.in/", checked: "2026-11-08" }],
    deadlines: [
      ...advance("tax year 2026-27", 2026, 2027),
      { id: "year-end", kind: "year_end", date: "2027-03-31", title: "Last day of tax year 2026-27", detail: "Tax-saving investments and payments for this year must be made by today." },
    ],
  },
];

export function taxDeadlinesFor(fy: FinancialYearKey): TaxDeadlineSet | null {
  return TAX_DEADLINE_SETS.find((s) => s.fy === fy) ?? null;
}

/** The years that have deadlines: the calendar reads tax records for these only. */
export const TAX_DEADLINE_YEARS: readonly FinancialYearKey[] = TAX_DEADLINE_SETS.map((s) => s.fy);
