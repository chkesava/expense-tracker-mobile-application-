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
      pushRecentCategoryPair("Food & Groceries", "Groceries / Kirana");
      pushRecentCategoryPair("Transport & Vehicles", "Petrol");

      const recents = getRecentCategoryPairs();
      expect(recents.length).toBe(2);
      expect(recents[0]).toMatchObject({
        category: "Transport & Vehicles",
        subcategory: "Petrol",
      });
      expect(recents[1]).toMatchObject({
        category: "Food & Groceries",
        subcategory: "Groceries / Kirana",
      });
    });

    it("should deduplicate and move existing pair to top", () => {
      pushRecentCategoryPair("Food & Groceries", "Groceries / Kirana");
      pushRecentCategoryPair("Home & Household", "Rent");
      pushRecentCategoryPair("Food & Groceries", "Groceries / Kirana");

      const recents = getRecentCategoryPairs();
      expect(recents.length).toBe(2);
      expect(recents[0].category).toBe("Food & Groceries");
      expect(recents[0].subcategory).toBe("Groceries / Kirana");
      expect(recents[1].category).toBe("Home & Household");
    });

    it("should cap recent pairs at max limit (12)", () => {
      for (let i = 0; i < 16; i++) {
        pushRecentCategoryPair(`Cat-${i}`, `Sub-${i}`);
      }
      const recents = getRecentCategoryPairs();
      expect(recents.length).toBe(12);
      expect(recents[0].category).toBe("Cat-15");
    });
  });

  describe("Taxonomy & Legacy Remapping", () => {
    it("returns correct emoji icons for top-level categories", () => {
      expect(getCategoryIcon("Food & Groceries")).toBe("🍽");
      expect(getCategoryIcon("Home & Household")).toBe("🏠");
      expect(getCategoryIcon("Transport & Vehicles")).toBe("🚗");
      expect(getCategoryIcon("Unknown Category")).toBe("📦");
    });

    it("remaps legacy flat categories properly", () => {
      const mappedGrocery = mapLegacyExpense("Groceries", "bought apples");
      expect(mappedGrocery.category).toBe("Food & Groceries");
      expect(mappedGrocery.subcategory).toBe("Groceries / Kirana");

      const mappedRent = mapLegacyExpense("Rent", "apartment rent");
      expect(mappedRent.category).toBe("Home & Household");
      expect(mappedRent.subcategory).toBe("Rent");
    });

    it("contains complete taxonomy structure", () => {
      expect(CATEGORY_TAXONOMY.length).toBeGreaterThan(5);
      const foodNode = CATEGORY_TAXONOMY.find((t) => t.name === "Food & Groceries");
      expect(foodNode).toBeDefined();
      expect(foodNode?.subcategories.map((s) => s.name)).toContain("Groceries / Kirana");
      expect(foodNode?.subcategories.map((s) => s.name)).toContain("Restaurants & Dining");
    });
  });
});
