/**
 * SPENDLY-295 — the rule set for each supported year. A year without one
 * gets no estimate ("rules for this year aren't in Spendly yet"), never the
 * nearest year's rules.
 *
 * FY 2026-27 onwards (Income-tax Act, 2025) is added only once its figures are
 * checked against official sources (plan D2).
 */

import type { FinancialYearKey } from "../../types";
import { FY2025_26_RULES } from "./fy2025_26";
import type { TaxRuleSet } from "./types";

export const TAX_RULE_SETS: readonly TaxRuleSet[] = [FY2025_26_RULES];

export function taxRulesFor(fy: FinancialYearKey): TaxRuleSet | null {
  return TAX_RULE_SETS.find((r) => r.fy === fy) ?? null;
}

export function taxRulesByVersion(ruleVersion: string): TaxRuleSet | null {
  return TAX_RULE_SETS.find((r) => r.ruleVersion === ruleVersion) ?? null;
}

export type { TaxRegime, TaxRuleSet } from "./types";
