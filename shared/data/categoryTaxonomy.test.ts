import { describe, expect, it } from "vitest";
import {
  CATEGORY_TAXONOMY,
  mapLegacyExpense,
  mapToV2Category,
  suggestCategoryFromNote,
} from "./categoryTaxonomy";

describe("suggestCategoryFromNote", () => {
  it("maps chicken to Groceries", () => {
    expect(suggestCategoryFromNote("Chicken for dinner")).toEqual({
      category: "Food",
      subcategory: "Groceries",
    });
  });

  it("maps petrol to Petrol / Diesel", () => {
    expect(suggestCategoryFromNote("Filled petrol")).toEqual({
      category: "Travel",
      subcategory: "Petrol / Diesel",
    });
  });

  it("maps Claude to Bills", () => {
    expect(suggestCategoryFromNote("Claude subscription")).toEqual({
      category: "Bills",
      subcategory: "Other Bills",
    });
  });

  it("prefers diet chicken over generic chicken", () => {
    expect(suggestCategoryFromNote("Chicken for diet")).toEqual({
      category: "Health",
      subcategory: "Gym / Fitness",
    });
  });
});

describe("mapLegacyExpense", () => {
  it("maps Brother Related via legacy map", () => {
    expect(mapLegacyExpense("Brother Related", "")).toEqual({
      category: "Family",
      subcategory: "Family Support",
    });
  });

  it("uses note rules over legacy category", () => {
    expect(mapLegacyExpense("Subscriptions", "Paid for Claude")).toEqual({
      category: "Bills",
      subcategory: "Other Bills",
    });
  });

  it("maps Food to the Food parent", () => {
    expect(mapLegacyExpense("Food", "")).toEqual({
      category: "Food",
      subcategory: "Other Food",
    });
  });

  it("maps Petrol legacy name", () => {
    expect(mapLegacyExpense("Petrol", "")).toEqual({
      category: "Travel",
      subcategory: "Petrol / Diesel",
    });
  });
});

describe("mapToV2Category", () => {
  it("maps Food & Dining groceries onto Food", () => {
    expect(mapToV2Category("Food & Dining", "Groceries")).toEqual({
      category: "Food",
      subcategory: "Groceries",
    });
  });

  it("maps Housing rent onto Home", () => {
    expect(mapToV2Category("Housing", "Rent")).toEqual({
      category: "Home",
      subcategory: "Rent",
    });
  });

  it("maps Bills electricity onto Home so the overlap is gone", () => {
    expect(mapToV2Category("Bills", "Electricity")).toEqual({
      category: "Home",
      subcategory: "Electricity",
    });
  });

  it("leaves custom categories unchanged", () => {
    expect(mapToV2Category("Office Chai Fund", "Snacks")).toBeNull();
  });

  it("keeps already-current pairs", () => {
    expect(mapToV2Category("Travel", "Petrol / Diesel")).toEqual({
      category: "Travel",
      subcategory: "Petrol / Diesel",
    });
  });
});

describe("CATEGORY_TAXONOMY", () => {
  it("has a compact mutually exclusive Indian set", () => {
    expect(CATEGORY_TAXONOMY.map((t) => t.name)).toEqual([
      "Food",
      "Home",
      "Travel",
      "Bills",
      "Shopping",
      "Health",
      "Family",
      "Education",
      "Entertainment",
      "Savings & EMI",
      "Income",
      "Other",
    ]);
  });
});
