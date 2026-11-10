/**
 * SPENDLY-295 — the shape of one tax year's rules. A rule set is data: the
 * engine (`utils/computeTax.ts`) holds no rates of its own.
 *
 * A rule set never changes once a snapshot can point at it. A correction or a
 * new Finance Act is a new `ruleVersion` (and a test), so a stored snapshot
 * keeps showing the version it was computed with.
 */

import type { FinancialYearKey, TaxAgeBand, TaxLaw } from "../../types";

export type TaxRegime = "old" | "new";

/** Slabs in order: `upTo` is inclusive; `null` = no upper limit. */
export type TaxSlab = { upTo: number | null; rate: number };

export type SurchargeBand = { above: number; rate: number };

export interface TaxRuleSource {
  label: string;
  url: string;
  /** When the figures were checked against it (YYYY-MM-DD). */
  checked: string;
}

export interface RegimeRules {
  /** Slabs by age band; `below_60` is used when the age band is unknown (an assumption, shown). */
  slabs: Record<Exclude<TaxAgeBand, "unknown">, readonly TaxSlab[]>;
  /** s.16(ia): the lower of this or the salary. */
  standardDeduction: number;
  /** s.87A for residents. */
  rebate: {
    maxTotalIncome: number;
    maxRebate: number;
    /** New regime: relief so tax never exceeds the income above the limit. */
    marginalRelief: boolean;
    /** Tax at special rates that the rebate may not reduce. */
    notAgainst: readonly SpecialRateKind[];
  };
  surcharge: readonly SurchargeBand[];
  /** Exempt allowances (s.10), professional tax (s.16(iii)) and self-occupied home-loan interest apply. */
  salaryExemptions: boolean;
  professionalTaxCap: number | null;
  selfOccupiedInterestCap: number | null;
  /** Deduction catalog ids allowed in this regime, with their caps (`null` = as entered). */
  deductions: Readonly<Record<string, DeductionRule>>;
}

export type SpecialRateKind = "stcg_111a" | "ltcg_112" | "ltcg_112a";

export type DeductionRule =
  | { kind: "as_entered"; section: string; assumption?: string }
  | { kind: "cap"; section: string; cap: number; seniorCap?: number; assumption?: string }
  /** Several catalog ids share one cap (e.g. s.80CCE). */
  | { kind: "group"; section: string; group: string };

export interface TaxRuleSet {
  ruleVersion: string;
  fy: FinancialYearKey;
  law: TaxLaw;
  /** Dates the rules apply to (the year). */
  effectiveFrom: string;
  effectiveTo: string;
  sources: readonly TaxRuleSource[];
  regimes: Record<TaxRegime, RegimeRules>;
  /** Shared caps for `group` deductions. */
  deductionGroups: Readonly<Record<string, { section: string; cap: number }>>;
  cess: number;
  capitalGains: {
    stcg111aRate: number;
    ltcg112Rate: number;
    ltcg112aRate: number;
    ltcg112aExemption: number;
    /** Surcharge on special-rate capital gains and dividends never exceeds this. */
    specialSurchargeCap: number;
  };
  houseProperty: { standardDeductionRate: number };
  /** s.80TTA (below 60) and s.80TTB (60 or older). */
  savingsInterest: { ttaCap: number; ttbCap: number };
  /** Total income and the final tax are rounded to this (s.288A, s.288B). */
  roundTo: number;
}
