/**
 * Merchant Intelligence data model (SPENDLY-187, epic SPENDLY-186).
 *
 * Merchants are DERIVED: resolved on the fly from a transaction's text and
 * never written onto expense or income documents. The only stored merchant
 * data is the user's own corrections (`MerchantOverride`, SPENDLY-191).
 * The source transaction — amount, date, account, direction, category,
 * note — is never changed.
 *
 * Documented in docs/SPENDLY-187-merchant-model.md.
 */

/** Bumped whenever registry contents or resolution rules change meaningfully. */
export const MERCHANT_INTELLIGENCE_VERSION = 1;

/** The payment rail a narration came through. */
export const MERCHANT_RAILS = ["upi", "upi_qr", "card", "gateway", "neft", "imps", "rtgs", "atm", "other"] as const;
export type MerchantRail = (typeof MERCHANT_RAILS)[number];

/** A canonical merchant in the bundled registry (no network lookups). */
export interface Merchant {
  /** Stable slug, e.g. "swiggy". */
  id: string;
  displayName: string;
  legalName?: string;
  /** Folded alias keys (lowercase alphanumerics) that resolve to this merchant. */
  aliases: string[];
  /** Taxonomy names (shared/data/categoryTaxonomy.ts), as a suggestion only. */
  category?: string;
  subcategory?: string;
  /** Rails the merchant is commonly seen on (informational). */
  rails?: MerchantRail[];
  /** Key of a bundled icon, never a remote URL. */
  logoKey?: string;
}

/**
 * - high: confirmed by the user, or an exact alias match.
 * - medium: a deterministic rule matched (e.g. VPA handle, prefix).
 * - low: a contextual guess; shown with "might be".
 * - unknown: not recognised; the cleaned text is shown as-is.
 */
export const MERCHANT_CONFIDENCES = ["high", "medium", "low", "unknown"] as const;
export type MerchantConfidence = (typeof MERCHANT_CONFIDENCES)[number];

export const MERCHANT_METHODS = ["user_override", "user_alias", "alias_exact", "rule", "context", "unresolved"] as const;
export type MerchantMethod = (typeof MERCHANT_METHODS)[number];

export interface MerchantResolution {
  /** Canonical merchant id, a `custom:` id for a user-named merchant, or null when unresolved. */
  merchantId: string | null;
  displayName: string;
  confidence: MerchantConfidence;
  method: MerchantMethod;
  rail: MerchantRail;
  /** The original text, untouched. */
  raw: string;
  /** The cleaned matching key. */
  normalized: string;
  /** Which alias, rule or override matched — for "why this merchant?". */
  matchedBy?: string;
  /** Category suggestion from the merchant (never applied automatically). */
  suggestedCategory?: string;
  suggestedSubcategory?: string;
  /** Registry/rules version that produced this result. */
  version: number;
}

export const MERCHANT_OVERRIDE_KINDS = ["transaction", "alias"] as const;
export type MerchantOverrideKind = (typeof MERCHANT_OVERRIDE_KINDS)[number];

/**
 * A user's correction, stored at users/{uid}/merchantOverrides/{id}.
 * - transaction: applies to one transaction (`refKey` = "expense:{id}" / "income:{id}").
 * - alias: applies to every transaction whose normalized text is `refKey`.
 * Exactly one of `merchantId` / `customName` is set unless `rejected`.
 */
export interface MerchantOverride {
  id: string;
  kind: MerchantOverrideKind;
  refKey: string;
  merchantId?: string;
  customName?: string;
  /** "Not this merchant" — show the cleaned text instead of a registry match. */
  rejected?: boolean;
  category?: string;
  subcategory?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

/** The text and context the resolver reads from one transaction. */
export interface MerchantSourceText {
  /** "expense:{id}" or "income:{id}". */
  refKey: string;
  /** The transaction note / narration (the merchant usually leads it). */
  text: string;
  kind: "expense" | "income";
  category?: string;
}
