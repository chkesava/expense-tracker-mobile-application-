/**
 * Merchant model helpers (SPENDLY-187): ids, keys, override validation and
 * the transaction → resolver input mapping. Pure.
 */

import type { Expense, Income } from "../types/expense";
import { MERCHANT_OVERRIDE_KINDS, type MerchantOverride, type MerchantSourceText } from "../types/merchant";

export const MERCHANT_LIMITS = { name: 60, refKey: 200, category: 80 } as const;

/** Lowercase alphanumerics only — the folding used for alias keys. */
export function foldKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Stable slug for a merchant name: "Adyar Ananda Bhavan" → "adyar-ananda-bhavan". */
export function merchantSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Id for a merchant the user named themselves. */
export const customMerchantId = (name: string) => `custom:${merchantSlug(name)}`;
export const isCustomMerchantId = (id: string) => id.startsWith("custom:");

export const transactionRefKey = (kind: "expense" | "income", id: string) => `${kind}:${id}`;

/** Firestore-safe document id for an override (slashes replaced). */
export function merchantOverrideId(kind: MerchantOverride["kind"], refKey: string): string {
  return `${kind}__${refKey.replace(/\//g, "_")}`.slice(0, 300);
}

/** Problems with an override, as sentences. Empty = valid. */
export function validateMerchantOverride(o: Omit<MerchantOverride, "id" | "createdAtMs" | "updatedAtMs">): string[] {
  const issues: string[] = [];
  if (!MERCHANT_OVERRIDE_KINDS.includes(o.kind)) issues.push("Unknown correction type.");
  if (!o.refKey || o.refKey.length > MERCHANT_LIMITS.refKey) issues.push("Missing what this correction applies to.");
  const named = [o.merchantId, o.customName].filter(Boolean).length;
  if (!o.rejected && named !== 1) issues.push("Choose one merchant or type a name.");
  if (o.rejected && named > 0) issues.push("A rejected match can't also name a merchant.");
  if (o.customName !== undefined && (!o.customName.trim() || o.customName.length > MERCHANT_LIMITS.name)) issues.push(`Keep the name under ${MERCHANT_LIMITS.name} characters.`);
  if ((o.category?.length ?? 0) > MERCHANT_LIMITS.category || (o.subcategory?.length ?? 0) > MERCHANT_LIMITS.category) issues.push("Category name is too long.");
  if (o.subcategory && !o.category) issues.push("A subcategory needs a category.");
  return issues;
}

/** What the resolver reads from an expense or income. Never writes back. */
export function expenseSourceText(e: Expense & { id: string }): MerchantSourceText {
  return { refKey: transactionRefKey("expense", e.id), text: e.note ?? "", kind: "expense", category: e.category };
}

export function incomeSourceText(i: Income & { id: string }): MerchantSourceText {
  // Income notes are often empty; the source label is the next best text.
  return { refKey: transactionRefKey("income", i.id), text: i.note?.trim() ? i.note : "", kind: "income" };
}
