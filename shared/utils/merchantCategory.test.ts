import { describe, expect, it } from "vitest";

import type { MerchantResolution } from "../types/merchant";
import { merchantCategorySuggestion } from "./merchantCategory";

const resolution = (overrides: Partial<MerchantResolution> = {}): MerchantResolution => ({
  merchantId: "swiggy",
  displayName: "Swiggy",
  confidence: "high",
  method: "alias_exact",
  rail: "upi",
  raw: "Swiggy",
  normalized: "swiggy",
  suggestedCategory: "Food & Groceries",
  suggestedSubcategory: "Food Delivery",
  matchedBy: "swiggy",
  version: 1,
  ...overrides,
});

describe("merchantCategorySuggestion", () => {
  it("returns a valid merchant pair with provenance", () => {
    expect(merchantCategorySuggestion(resolution())).toEqual({
      category: "Food & Groceries",
      subcategory: "Food Delivery",
      merchantId: "swiggy",
      merchantName: "Swiggy",
      confidence: "high",
      method: "alias_exact",
      matchedBy: "swiggy",
      version: 1,
      provenance: "merchant",
    });
  });

  it("allows medium rules and trusted user corrections", () => {
    expect(merchantCategorySuggestion(resolution({ confidence: "medium", method: "rule" }))).toMatchObject({
      confidence: "medium",
      method: "rule",
    });
    expect(
      merchantCategorySuggestion(
        resolution({
          merchantId: "custom:home-cook",
          displayName: "Home Cook",
          method: "user_override",
          suggestedCategory: "Food & Groceries",
          suggestedSubcategory: "Tiffin / Meals",
        }),
      ),
    ).toMatchObject({ merchantId: "custom:home-cook", method: "user_override", provenance: "merchant" });
  });

  it("does not apply low-confidence, unknown, incomplete, or invalid suggestions", () => {
    expect(merchantCategorySuggestion(resolution({ confidence: "low", method: "context" }))).toBeNull();
    expect(merchantCategorySuggestion(resolution({ merchantId: null, confidence: "unknown", method: "unresolved" }))).toBeNull();
    expect(merchantCategorySuggestion(resolution({ suggestedSubcategory: undefined }))).toBeNull();
    expect(
      merchantCategorySuggestion(
        resolution({ suggestedCategory: "Not a category", suggestedSubcategory: "Not a subcategory" }),
      ),
    ).toBeNull();
  });
});
