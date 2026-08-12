/**
 * Phase 7 — assign category/subcategory from merchant rules (no AI).
 */

import type { CategorizationRule } from "@/shared/types/expense";
import { foldMerchantKey } from "./smsMerchantNormalizer";
import { SMS_MERCHANT_CATEGORY_RULES } from "./smsCategoryRules";

export type SmsCategoryMatch = {
  category: string;
  subcategory: string;
  source: "user_rule" | "merchant_rule";
};

function matchUserRule(
  merchant: string,
  rules: CategorizationRule[]
): SmsCategoryMatch | null {
  const folded = foldMerchantKey(merchant);
  const haystack = merchant.toLowerCase();
  let best: CategorizationRule | null = null;

  for (const rule of rules) {
    const keyword = (rule.keyword || "").trim();
    if (!keyword) continue;
    const foldedKeyword = foldMerchantKey(keyword);
    if (
      folded === foldedKeyword ||
      folded.includes(foldedKeyword) ||
      haystack.includes(keyword.toLowerCase())
    ) {
      if (!best || keyword.length > best.keyword.length) best = rule;
    }
  }

  if (!best) return null;
  return {
    category: best.category,
    subcategory: best.subcategory || "Other",
    source: "user_rule",
  };
}

/**
 * Look up category for a canonical (or raw) merchant name.
 * User keyword rules win over the built-in merchant catalog.
 */
export function categorizeSmsMerchant(
  merchant?: string | null,
  userRules: CategorizationRule[] = []
): SmsCategoryMatch | null {
  const name = (merchant || "").trim();
  if (!name) return null;

  const userHit = matchUserRule(name, userRules);
  if (userHit) return userHit;

  const folded = foldMerchantKey(name);
  const rule = SMS_MERCHANT_CATEGORY_RULES.find(
    (r) => foldMerchantKey(r.merchant) === folded
  );
  if (!rule) return null;

  return {
    category: rule.category,
    subcategory: rule.subcategory,
    source: "merchant_rule",
  };
}
