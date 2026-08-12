/**
 * Phase 6 — collapse SMS merchant variants into one canonical name.
 * SWIGGYIN / SWIGGY LIMITED / SWIGGY*ORDER → Swiggy
 */

import {
  SMS_MERCHANT_CATALOG,
  type SmsMerchantEntry,
} from "./smsMerchantCatalog";

export type SmsMerchantNormalization = {
  /** Canonical display name when a catalog match is found. */
  merchant?: string;
  /** Original extracted token (before catalog mapping). */
  merchantRaw?: string;
  matched: boolean;
  reason?: string;
};

/** Legal / SMS suffixes stripped after folding (longest first). */
const FOLD_SUFFIXES = [
  "privatelimited",
  "pvtlimited",
  "pvtlt",
  "pvt",
  "limited",
  "ltd",
  "llc",
  "inc",
  "india",
  "instamart",
  "internet",
  "retail",
  "stores",
  "store",
  "payment",
  "payments",
  "order",
  "orders",
  "trip",
  "ride",
  "eats",
  "food",
  "pay",
  "app",
  "com",
  "in",
];

export function foldMerchantKey(value: string): string {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripKnownSuffixes(folded: string): string {
  let current = folded;
  let changed = true;
  while (changed && current.length > 3) {
    changed = false;
    for (const suffix of FOLD_SUFFIXES) {
      if (current.length - suffix.length < 3) continue;
      if (current.endsWith(suffix)) {
        current = current.slice(0, -suffix.length);
        changed = true;
        break;
      }
    }
  }
  return current;
}

function titleCaseUnknown(raw: string): string {
  const cleaned = raw
    .replace(/[*_./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return raw.trim();
  return cleaned
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function catalogKeys(entry: SmsMerchantEntry): string[] {
  const keys = [foldMerchantKey(entry.canonical)];
  for (const alias of entry.aliases ?? []) {
    const folded = foldMerchantKey(alias);
    if (folded) keys.push(folded);
  }
  return keys;
}

function matchCatalog(folded: string): { canonical: string; reason: string } | null {
  if (!folded) return null;
  const stripped = stripKnownSuffixes(folded);

  for (const entry of SMS_MERCHANT_CATALOG) {
    const keys = catalogKeys(entry);
    if (keys.includes(folded) || keys.includes(stripped)) {
      return { canonical: entry.canonical, reason: "alias_exact" };
    }
  }

  // Prefix: SWIGGYIN / SWIGGYORDER after fold, canonical key length >= 4
  for (const entry of SMS_MERCHANT_CATALOG) {
    const canonicalKey = foldMerchantKey(entry.canonical);
    if (canonicalKey.length < 4) continue;
    if (folded.startsWith(canonicalKey) || stripped.startsWith(canonicalKey)) {
      return { canonical: entry.canonical, reason: "alias_prefix" };
    }
  }

  return null;
}

/**
 * Map a raw extracted merchant token to a catalog name when possible.
 * Unknown merchants keep a title-cased cleanup (not dropped).
 */
export function normalizeMerchantName(
  raw?: string | null
): SmsMerchantNormalization {
  const merchantRaw = (raw || "").trim();
  if (!merchantRaw) {
    return { matched: false };
  }

  const folded = foldMerchantKey(merchantRaw);
  const hit = matchCatalog(folded);
  if (hit) {
    return {
      merchant: hit.canonical,
      merchantRaw,
      matched: true,
      reason: hit.reason,
    };
  }

  return {
    merchant: titleCaseUnknown(merchantRaw),
    merchantRaw,
    matched: false,
    reason: "unknown_titlecase",
  };
}
