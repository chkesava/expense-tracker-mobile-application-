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
      pushRecentCategoryPair("Food", "Groceries");
      pushRecentCategoryPair("Travel", "Petrol / Diesel");

      const recents = getRecentCategoryPairs();
      expect(recents.length).toBe(2);
      expect(recents[0]).toMatchObject({
        category: "Travel",
        subcategory: "Petrol / Diesel",
      });
      expect(recents[1]).toMatchObject({
        category: "Food",
        subcategory: "Groceries",
      });
    });

    it("should deduplicate and move existing pair to top", () => {
      pushRecentCategoryPair("Food", "Groceries");
      pushRecentCategoryPair("Home", "Rent");
      pushRecentCategoryPair("Food", "Groceries");

      const recents = getRecentCategoryPairs();
      expect(recents.length).toBe(2);
      expect(recents[0].category).toBe("Food");
      expect(recents[0].subcategory).toBe("Groceries");
      expect(recents[1].category).toBe("Home");
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
      expect(getCategoryIcon("Food")).toBe("🍽");
      expect(getCategoryIcon("Home")).toBe("🏠");
      expect(getCategoryIcon("Travel")).toBe("🚗");
      expect(getCategoryIcon("Unknown Category")).toBe("📦");
    });

    it("remaps legacy flat categories properly", () => {
      const mappedGrocery = mapLegacyExpense("Groceries", "bought apples");
      expect(mappedGrocery.category).toBe("Food");
      expect(mappedGrocery.subcategory).toBe("Groceries");

      const mappedRent = mapLegacyExpense("Rent", "apartment rent");
      expect(mappedRent.category).toBe("Home");
      expect(mappedRent.subcategory).toBe("Rent");
    });

    it("contains complete taxonomy structure", () => {
      expect(CATEGORY_TAXONOMY.length).toBeGreaterThan(5);
      const foodNode = CATEGORY_TAXONOMY.find((t) => t.name === "Food");
      expect(foodNode).toBeDefined();
      expect(foodNode?.subcategories).toContain("Groceries");
      expect(foodNode?.subcategories).toContain("Eating Out");
    });
  });
});
