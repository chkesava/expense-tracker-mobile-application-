import { describe, expect, it } from "vitest";
import {
  mapLegacyExpense,
  suggestCategoryFromNote,
} from "./categoryTaxonomy";

describe("suggestCategoryFromNote", () => {
  it("maps chicken to Meat & Chicken", () => {
    expect(suggestCategoryFromNote("Chicken for dinner")).toEqual({
      category: "Food & Dining",
      subcategory: "Meat & Chicken",
    });
  });

  it("maps petrol to Fuel", () => {
    expect(suggestCategoryFromNote("Filled petrol")).toEqual({
      category: "Transportation",
      subcategory: "Fuel",
    });
  });

  it("maps Claude to AI Tools", () => {
    expect(suggestCategoryFromNote("Claude subscription")).toEqual({
      category: "Technology",
      subcategory: "AI Tools",
    });
  });

  it("prefers diet chicken over generic chicken", () => {
    expect(suggestCategoryFromNote("Chicken for diet")).toEqual({
      category: "Fitness & Nutrition",
      subcategory: "Healthy Food",
    });
  });
});

describe("mapLegacyExpense", () => {
  it("maps Brother Related via legacy map", () => {
    expect(mapLegacyExpense("Brother Related", "")).toEqual({
      category: "Family",
      subcategory: "Brother",
    });
  });

  it("uses note rules over legacy category", () => {
    expect(mapLegacyExpense("Subscriptions", "Paid for Claude")).toEqual({
      category: "Technology",
      subcategory: "AI Tools",
    });
  });

  it("maps Food to Food & Dining", () => {
    expect(mapLegacyExpense("Food", "")).toEqual({
      category: "Food & Dining",
      subcategory: "Other Food",
    });
  });

  it("maps Petrol legacy name", () => {
    expect(mapLegacyExpense("Petrol", "")).toEqual({
      category: "Transportation",
      subcategory: "Fuel",
    });
  });
});
