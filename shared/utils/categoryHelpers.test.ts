import { beforeEach, describe, expect, it } from "vitest";

import {
  CATEGORY_TAXONOMY,
  getCategoryIcon,
  mapLegacyExpense,
} from "../data/categoryTaxonomy";
import { getSharedStorage } from "../storage/memoryStorage";
import {
  getRecentCategoryPairs,
  pushRecentCategoryPair,
} from "./categoryPreferences";

describe("Category Preferences & Taxonomy Tests", () => {
  beforeEach(() => {
    getSharedStorage().removeItem?.("recentCategoryPairs");
  });

  describe("Recent Category Pairs", () => {
    it("should store and retrieve recently used category and subcategory pairs", () => {
      pushRecentCategoryPair("Food & Dining", "Groceries");
      pushRecentCategoryPair("Transportation", "Fuel");

      const recents = getRecentCategoryPairs();
      expect(recents.length).toBe(2);
      expect(recents[0]).toMatchObject({
        category: "Transportation",
        subcategory: "Fuel",
      });
      expect(recents[1]).toMatchObject({
        category: "Food & Dining",
        subcategory: "Groceries",
      });
    });

    it("should deduplicate and move existing pair to top", () => {
      pushRecentCategoryPair("Food & Dining", "Groceries");
      pushRecentCategoryPair("Housing", "Rent");
      pushRecentCategoryPair("Food & Dining", "Groceries");

      const recents = getRecentCategoryPairs();
      expect(recents.length).toBe(2);
      expect(recents[0].category).toBe("Food & Dining");
      expect(recents[0].subcategory).toBe("Groceries");
      expect(recents[1].category).toBe("Housing");
    });

    it("should cap recent pairs at max limit (8)", () => {
      for (let i = 0; i < 12; i++) {
        pushRecentCategoryPair(`Cat-${i}`, `Sub-${i}`);
      }
      const recents = getRecentCategoryPairs();
      expect(recents.length).toBe(8);
      expect(recents[0].category).toBe("Cat-11");
    });
  });

  describe("Taxonomy & Legacy Remapping", () => {
    it("returns correct emoji icons for top-level categories", () => {
      expect(getCategoryIcon("Food & Dining")).toBe("🍽");
      expect(getCategoryIcon("Housing")).toBe("🏠");
      expect(getCategoryIcon("Transportation")).toBe("🚗");
      expect(getCategoryIcon("Unknown Category")).toBe("📦");
    });

    it("remaps legacy flat categories properly", () => {
      const mappedGrocery = mapLegacyExpense("Groceries", "bought apples");
      expect(mappedGrocery.category).toBe("Food & Dining");
      expect(mappedGrocery.subcategory).toBe("Groceries");

      const mappedRent = mapLegacyExpense("Rent", "apartment rent");
      expect(mappedRent.category).toBe("Housing");
      expect(mappedRent.subcategory).toBe("Rent");
    });

    it("contains complete taxonomy structure", () => {
      expect(CATEGORY_TAXONOMY.length).toBeGreaterThan(5);
      const foodNode = CATEGORY_TAXONOMY.find((t) => t.name === "Food & Dining");
      expect(foodNode).toBeDefined();
      expect(foodNode?.subcategories).toContain("Groceries");
      expect(foodNode?.subcategories).toContain("Restaurant");
    });
  });
});
