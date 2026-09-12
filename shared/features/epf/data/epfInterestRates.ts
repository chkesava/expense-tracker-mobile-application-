/**
 * EPF interest rates by financial year — KAN-70.
 *
 * Deliberately a separate file from `epfRules.ts`. Contribution slabs change on
 * arbitrary mid-year dates, while interest is *declared per financial year* —
 * one table cannot key both honestly, which is the reasoning recorded in
 * KAN-67.
 *
 * MAINTENANCE: EPFO declares each year's rate months after the year ends, so
 * this table is expected to be incomplete at the tail. Add a row when a rate is
 * declared; do not guess. `findEpfInterestRate` returns `null` for a year that
 * is not listed, and the UI says "not declared yet" rather than showing zero
 * interest — an invented rate would silently misstate someone's fund.
 */

export interface EpfInterestRate {
  /** "2023-24" — the year the rate applies to. */
  financialYear: string;
  /** Annual rate as a fraction, e.g. 0.0825 for 8.25%. */
  rate: number;
}

/** Newest first. Every entry is a rate EPFO has actually declared. */
export const EPF_INTEREST_RATES: readonly EpfInterestRate[] = [
  { financialYear: "2024-25", rate: 0.0825 },
  { financialYear: "2023-24", rate: 0.0825 },
  { financialYear: "2022-23", rate: 0.0815 },
  { financialYear: "2021-22", rate: 0.081 },
  { financialYear: "2020-21", rate: 0.085 },
  { financialYear: "2019-20", rate: 0.085 },
  { financialYear: "2018-19", rate: 0.0865 },
  { financialYear: "2017-18", rate: 0.0855 },
  { financialYear: "2016-17", rate: 0.0865 },
  { financialYear: "2015-16", rate: 0.088 },
  { financialYear: "2014-15", rate: 0.0875 },
  { financialYear: "2013-14", rate: 0.0875 },
  { financialYear: "2012-13", rate: 0.085 },
  { financialYear: "2011-12", rate: 0.0825 },
  { financialYear: "2010-11", rate: 0.095 },
] as const;

/**
 * The declared rate for a financial year, or `null` when EPFO has not declared
 * one yet.
 *
 * `null` is a normal state, not an error: the current financial year always
 * lacks a rate, and so does the one just ended until EPFO announces it.
 */
export function findEpfInterestRate(financialYear: string): EpfInterestRate | null {
  return EPF_INTEREST_RATES.find((rule) => rule.financialYear === financialYear) ?? null;
}

/** The oldest year this table can price. Anything earlier is unpriceable. */
export function earliestRatedFinancialYear(): string {
  return EPF_INTEREST_RATES[EPF_INTEREST_RATES.length - 1].financialYear;
}
