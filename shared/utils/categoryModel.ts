/**
 * SPENDLY-753 — pure category/subcategory naming model: normalization, the
 * deterministic name-lock keys, and duplicate detection. Mirrors
 * `shared/utils/goalModel.ts`'s `goalNameKey` pattern (the `goalNames/{key}`
 * create-only lock); `firestore.rules` is the trusted boundary for the locks
 * this derives keys for (`categoryNames`, `categorySubNames`).
 */

import type { Category } from "../types/expense";

/** Display form: trimmed, inner whitespace collapsed. */
export function cleanCategoryName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ");
}

/**
 * Comparison form used for uniqueness: NFKC, trimmed, collapsed whitespace,
 * lower-cased. "  Food &   Dining " and "food & dining" are the same category.
 */
export function normalizeCategoryName(name: string): string {
  return cleanCategoryName(name).toLowerCase();
}

/** Firestore document id for `categoryNames/{key}` (top-level categories). */
export function categoryNameKey(name: string): string {
  return `c_${encodeURIComponent(normalizeCategoryName(name))}`;
}

/**
 * Firestore document id for `categorySubNames/{key}` — scoped to the parent,
 * so the same subcategory name ("Other") can exist under many parents.
 */
export function subcategoryNameKey(parentId: string, name: string): string {
  return `cs_${parentId}_${encodeURIComponent(normalizeCategoryName(name))}`;
}

/** A top-level category with this (normalized) name already exists. */
export function isCategoryNameTaken(
  name: string,
  categories: readonly Pick<Category, "id" | "name" | "kind" | "parentId" | "isArchived">[],
  selfId?: string
): boolean {
  const key = normalizeCategoryName(name);
  return categories.some(
    (c) =>
      c.id !== selfId &&
      (c.kind ?? "category") === "category" &&
      !c.parentId &&
      !c.isArchived &&
      normalizeCategoryName(c.name ?? "") === key
  );
}

/** A subcategory with this (normalized) name already exists under `parentId`. */
export function isSubcategoryNameTaken(
  parentId: string,
  name: string,
  categories: readonly Pick<Category, "id" | "name" | "kind" | "parentId" | "isArchived">[],
  selfId?: string
): boolean {
  const key = normalizeCategoryName(name);
  return categories.some(
    (c) =>
      c.id !== selfId &&
      c.kind === "subcategory" &&
      c.parentId === parentId &&
      !c.isArchived &&
      normalizeCategoryName(c.name ?? "") === key
  );
}

function createdMs(category: Pick<Category, "createdAt">): number {
  const ts = category.createdAt as { toMillis?: () => number; seconds?: number } | undefined;
  if (ts && typeof ts.toMillis === "function") return ts.toMillis();
  if (ts && typeof ts.seconds === "number") return ts.seconds * 1000;
  return 0;
}

/**
 * Collapse docs that share a normalized key (parents: by name; subcategories:
 * by parentId + name) to one canonical doc per group, display-only — no
 * Firestore doc is touched. Prefers the default doc, else the oldest, else
 * the lowest id, so the choice is stable across renders and devices.
 */
export function dedupeByNormalizedName<T extends Pick<Category, "id" | "name" | "isDefault" | "createdAt">>(
  items: readonly T[],
  keyOf: (item: T) => string
): T[] {
  const byKey = new Map<string, T>();
  for (const item of items) {
    const key = keyOf(item);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }
    const itemIsDefault = !!item.isDefault;
    const existingIsDefault = !!existing.isDefault;
    if (itemIsDefault !== existingIsDefault) {
      if (itemIsDefault) byKey.set(key, item);
      continue;
    }
    const itemMs = createdMs(item);
    const existingMs = createdMs(existing);
    if (itemMs !== existingMs) {
      if (itemMs < existingMs) byKey.set(key, item);
      continue;
    }
    if (item.id < existing.id) byKey.set(key, item);
  }
  return [...byKey.values()];
}
