import { describe, expect, it } from "vitest";

import type { Category } from "../types/expense";
import {
  categoryNameKey,
  cleanCategoryName,
  dedupeByNormalizedName,
  isCategoryNameTaken,
  isSubcategoryNameTaken,
  normalizeCategoryName,
  subcategoryNameKey,
} from "./categoryModel";

describe("names", () => {
  it("cleans and normalizes case, spacing and unicode width", () => {
    expect(cleanCategoryName("  Food &   Dining  ")).toBe("Food & Dining");
    expect(normalizeCategoryName("  FOOD \t & dining ")).toBe("food & dining");
    expect(normalizeCategoryName("Ｓｈｏｐｐｉｎｇ")).toBe("shopping");
  });

  it("builds safe, collision-free, parent-scoped document ids", () => {
    expect(categoryNameKey("Trip / Goa")).toBe("c_trip%20%2F%20goa");
    expect(categoryNameKey(" Groceries")).toBe(categoryNameKey("groceries   "));
    expect(subcategoryNameKey("p1", "Other")).toBe("cs_p1_other");
    expect(subcategoryNameKey("p1", "Other")).not.toBe(subcategoryNameKey("p2", "Other"));
  });
});

describe("isCategoryNameTaken / isSubcategoryNameTaken", () => {
  const categories: Pick<Category, "id" | "name" | "kind" | "parentId" | "isArchived">[] = [
    { id: "a", name: "Shopping", kind: "category" },
    { id: "b", name: "Food", kind: "category" },
    { id: "c", name: "Archived Twin", kind: "category", isArchived: true },
    { id: "s1", name: "Other", kind: "subcategory", parentId: "a" },
    { id: "s2", name: "Other", kind: "subcategory", parentId: "b" },
  ];

  it("matches case/whitespace variants, scoped to active parents only", () => {
    expect(isCategoryNameTaken("  shopping ", categories)).toBe(true);
    expect(isCategoryNameTaken("Travel", categories)).toBe(false);
    expect(isCategoryNameTaken("archived twin", categories)).toBe(false);
    expect(isCategoryNameTaken("Shopping", categories, "a")).toBe(false);
  });

  it("scopes subcategory duplicates to their parent", () => {
    expect(isSubcategoryNameTaken("a", "other", categories)).toBe(true);
    expect(isSubcategoryNameTaken("c", "other", categories)).toBe(false);
    expect(isSubcategoryNameTaken("a", "Other", categories, "s1")).toBe(false);
  });
});

describe("dedupeByNormalizedName", () => {
  const item = (over: Partial<Category>): Pick<Category, "id" | "name" | "isDefault" | "createdAt"> => ({
    id: "x",
    name: "Shopping",
    ...over,
  });

  it("keeps one doc per key, preferring the default one", () => {
    const docs = [item({ id: "custom1" }), item({ id: "default1", isDefault: true })];
    const result = dedupeByNormalizedName(docs, (d) => normalizeCategoryName(d.name));
    expect(result.map((d) => d.id)).toEqual(["default1"]);
  });

  it("falls back to the oldest createdAt, then the lowest id", () => {
    const docs = [
      item({ id: "b", createdAt: { seconds: 200 } }),
      item({ id: "a", createdAt: { seconds: 100 } }),
      item({ id: "c", createdAt: { seconds: 100 } }),
    ];
    const result = dedupeByNormalizedName(docs, (d) => normalizeCategoryName(d.name));
    expect(result.map((d) => d.id)).toEqual(["a"]);
  });

  it("keeps distinct keys separate", () => {
    const docs = [item({ id: "a", name: "Shopping" }), item({ id: "b", name: "Food" })];
    const result = dedupeByNormalizedName(docs, (d) => normalizeCategoryName(d.name));
    expect(result.map((d) => d.id).sort()).toEqual(["a", "b"]);
  });
});
