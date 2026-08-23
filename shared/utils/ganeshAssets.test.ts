import { describe, expect, it } from "vitest";

import { changedAssetFields, summarizeAssets, validateAssetDraft } from "./ganeshAssets";

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
        { quantity: 10, status: "available" },
        { quantity: 2, status: "in_use" },
        { quantity: 1, status: "damaged" },
        { quantity: 3, status: "disposed" },
        { quantity: 1, status: "lost" },
      ])
    ).toEqual({
      totalItems: 17,
      totalRecords: 5,
      available: 12,
      damaged: 1,
      disposed: 4,
    });
  });
});
