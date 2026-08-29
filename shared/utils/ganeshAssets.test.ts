import { describe, expect, it } from "vitest";

import {
  changedAssetFields,
  expenseCashAmount,
  expenseTypeOf,
  isAssetPurchaseExpense,
  inventoryGlance,
  summarizeAssets,
  validateAssetDraft,
} from "./ganeshAssets";

describe("validateAssetDraft", () => {
  it("accepts a named item with a positive quantity", () => {
    expect(
      validateAssetDraft({ name: "  Chairs  ", quantity: 12, estimatedValue: 0 })
    ).toEqual({ name: "Chairs", quantity: 12, estimatedValue: 0 });
  });

  it("rejects a blank name, fraction quantity, or negative value", () => {
    expect(() => validateAssetDraft({ name: "  ", quantity: 1, estimatedValue: 0 })).toThrow(
      /asset name/i
    );
    expect(() => validateAssetDraft({ name: "Mic", quantity: 1.5, estimatedValue: 0 })).toThrow(
      /whole number/i
    );
    expect(() => validateAssetDraft({ name: "Mic", quantity: 0, estimatedValue: 0 })).toThrow(
      /Disposed or Lost/
    );
    expect(() => validateAssetDraft({ name: "Mic", quantity: 1, estimatedValue: -10 })).toThrow(
      /cannot be negative/
    );
  });

  it("allows quantity 0 only when the item is disposed or lost", () => {
    expect(
      validateAssetDraft({ name: "Old fan", quantity: 0, estimatedValue: 0, status: "disposed" })
    ).toEqual({ name: "Old fan", quantity: 0, estimatedValue: 0 });
  });
});

describe("changedAssetFields", () => {
  it("returns only fields that actually changed", () => {
    expect(
      changedAssetFields(
        { name: "Chairs", location: "Hall", condition: "good" },
        { name: "Chairs", location: "Store", condition: "good" }
      )
    ).toEqual({ location: "Store" });
  });
});

describe("summarizeAssets", () => {
  it("counts available, damaged, and disposed quantities", () => {
    expect(
      summarizeAssets([
        { quantity: 10, status: "available", estimatedValue: 8000 },
        { quantity: 2, status: "in_use", estimatedValue: 2000 },
        { quantity: 1, status: "damaged", estimatedValue: 500 },
        { quantity: 3, status: "disposed", estimatedValue: 100 },
        { quantity: 1, status: "lost", estimatedValue: 50 },
      ])
    ).toEqual({
      totalItems: 17,
      totalRecords: 5,
      available: 12,
      damaged: 1,
      disposed: 4,
      estimatedValue: 10500,
    });
  });
});

describe("inventoryGlance", () => {
  it("groups active quantity by category and condition, and flags what needs replacing", () => {
    expect(
      inventoryGlance([
        { category: "furniture", quantity: 20, status: "available", condition: "good" },
        { category: "furniture", quantity: 4, status: "in_use", condition: "fair" },
        { category: "sound", quantity: 2, status: "damaged", condition: "damaged" },
        { category: "lighting", quantity: 1, status: "available", condition: "unusable" },
        { category: "kitchen", quantity: 6, status: "disposed", condition: "good" },
      ])
    ).toEqual({
      byCategory: [
        { id: "furniture", label: "Furniture", quantity: 24 },
        { id: "sound", label: "Sound", quantity: 2 },
        { id: "lighting", label: "Lighting", quantity: 1 },
      ],
      byCondition: [
        { id: "good", label: "Good", quantity: 20 },
        { id: "fair", label: "Fair", quantity: 4 },
        { id: "damaged", label: "Damaged", quantity: 2 },
        { id: "unusable", label: "Unusable", quantity: 1 },
      ],
      needsReplacing: 3,
    });
  });
});

describe("expense type helpers", () => {
  it("treats a missing type as a regular expense", () => {
    expect(expenseTypeOf({})).toBe("normal");
    expect(isAssetPurchaseExpense({ expenseType: "normal" })).toBe(false);
    expect(isAssetPurchaseExpense({ name: "Flowers" } as never)).toBe(false);
  });

  it("treats asset_purchase or a linked assetId as a purchase", () => {
    expect(expenseTypeOf({ expenseType: "asset_purchase" })).toBe("asset_purchase");
    expect(isAssetPurchaseExpense({ expenseType: "asset_purchase" })).toBe(true);
    expect(isAssetPurchaseExpense({ assetId: "chair-1" })).toBe(true);
  });

  it("counts only God Fund and personal cash", () => {
    expect(expenseCashAmount({ godFundAmount: 10000, personalAmount: 5000 })).toBe(15000);
  });
});
