/**
 * Merchant-aware category suggestions (SPENDLY-190).
 *
 * This is suggestion metadata only. It never changes a stored transaction and
 * deliberately ignores low-confidence and unresolved merchant resolutions.
 */

import { isExactTaxonomyPair } from "../data/categoryTaxonomy";
import type { MerchantMethod, MerchantResolution } from "../types/merchant";

export interface MerchantCategorySuggestion {
  category: string;
  subcategory: string;
  merchantId: string;
  merchantName: string;
  confidence: "high" | "medium";
  method: Extract<MerchantMethod, "user_override" | "user_alias" | "alias_exact" | "rule">;
  matchedBy?: string;
  version: number;
  provenance: "merchant";
}

/**
 * Convert a trusted merchant resolution into a valid current taxonomy pair.
 * Low-confidence guesses are intentionally left to the existing note rules.
 */
export function merchantCategorySuggestion(
  resolution: MerchantResolution,
): MerchantCategorySuggestion | null {
  if (
    !resolution.merchantId ||
    (resolution.confidence !== "high" && resolution.confidence !== "medium") ||
    !resolution.suggestedCategory ||
    !resolution.suggestedSubcategory ||
    !isExactTaxonomyPair(resolution.suggestedCategory, resolution.suggestedSubcategory)
  ) {
    return null;
  }

  return {
    category: resolution.suggestedCategory,
    subcategory: resolution.suggestedSubcategory,
    merchantId: resolution.merchantId,
    merchantName: resolution.displayName,
    confidence: resolution.confidence,
    method: resolution.method as MerchantCategorySuggestion["method"],
    ...(resolution.matchedBy ? { matchedBy: resolution.matchedBy } : {}),
    version: resolution.version,
    provenance: "merchant",
  };
}
