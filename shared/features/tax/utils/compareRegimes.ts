/**
 * SPENDLY-295 — both regimes on the same figures, side by side. Informational
 * only: which regime gives lower tax on these figures, never which to choose
 * (the user may not be able to switch, and the figures may be incomplete).
 *
 * `estimateSnapshotPayload` is what a snapshot stores (SPENDLY-296 "marked
 * reviewed", SPENDLY-710 "export"): the rule version, a hash of the input and
 * the outputs. A later rule set never rewrites it.
 */

import { taxRulesFor } from "../data/taxRules";
import type { TaxRuleSet } from "../data/taxRules/types";
import type { TaxLaw } from "../types";
import { computeTax, type TaxComputation } from "./computeTax";
import type { TaxEstimateInput } from "./taxInput";

export interface TaxRegimeComparison {
  fy: string;
  ruleVersion: string | null;
  law: TaxLaw | null;
  new: TaxComputation;
  old: TaxComputation;
  /** Lower estimated liability on these figures; `null` when either has no estimate. */
  lower: "new" | "old" | "same" | null;
  /** How much lower, in rupees. */
  difference: number | null;
}

export function compareRegimes(input: TaxEstimateInput, rules: TaxRuleSet | null = taxRulesFor(input.fy)): TaxRegimeComparison {
  const next = computeTax(input, rules, "new");
  const old = computeTax(input, rules, "old");
  const both = next.liability !== null && old.liability !== null;
  const lower = !both ? null : next.liability === old.liability ? "same" : next.liability! < old.liability! ? "new" : "old";
  return {
    fy: input.fy,
    ruleVersion: rules?.ruleVersion ?? null,
    law: rules?.law ?? null,
    new: next,
    old,
    lower,
    difference: both ? Math.abs(next.liability! - old.liability!) : null,
  };
}

/** Keys sorted at every level, so equal inputs always serialise the same way. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** FNV-1a (32-bit), hex. Identifies an input; not a security hash. */
export function hashTaxInput(input: TaxEstimateInput): string {
  const text = stableStringify(input);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function estimateSnapshotPayload(input: TaxEstimateInput, comparison: TaxRegimeComparison): {
  ruleVersion: string;
  inputHash: string;
  outputs: Record<string, number | null>;
  unresolvedCount: number;
} | null {
  if (!comparison.ruleVersion) return null;
  const outputs: Record<string, number | null> = {};
  for (const regime of ["new", "old"] as const) {
    const c = comparison[regime];
    outputs[`${regime}.totalIncome`] = c.totalIncome;
    outputs[`${regime}.liability`] = c.liability;
    outputs[`${regime}.balance`] = c.balance;
  }
  outputs.taxesPaid = comparison.new.taxesPaid;
  return {
    ruleVersion: comparison.ruleVersion,
    inputHash: hashTaxInput(input),
    outputs,
    unresolvedCount: input.gaps.unsupported.length + input.gaps.missing.length + input.gaps.pending.length,
  };
}
