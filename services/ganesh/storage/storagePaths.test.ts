import { describe, expect, it } from "vitest";

import {
  assertOwnedFestivalPath,
  assertOwnedPandalAssetPath,
  assertSafeId,
  buildFestivalFilePath,
  assertOwnedPandalSponsorPath,
  buildPandalAssetPath,
  buildPandalSponsorPath,
  ganeshStoredPath,
  isPandalAssetPath,
  isPandalSponsorPath,
  sanitizeFileName,
} from "./storagePaths";

describe("storagePaths", () => {
  it("builds a festival file path from session IDs", () => {
    expect(
      buildFestivalFilePath({
        pandalId: "pandal1",
        festivalId: "fest2026",
        category: "expenses",
        recordId: "exp1",
        fileName: "receipt.jpg",
      })
    ).toBe("pandals/pandal1/festivals/fest2026/expenses/exp1/receipt.jpg");
  });

  it("rejects traversal and extra slashes in IDs", () => {
    expect(() => assertSafeId("..", "Pandal")).toThrow("Invalid Pandal.");
    expect(() => assertSafeId("pandal/other", "Pandal")).toThrow("Invalid Pandal.");
    expect(() =>
      buildFestivalFilePath({
        pandalId: "../secret",
        festivalId: "fest2026",
        category: "expenses",
        recordId: "exp1",
        fileName: "receipt.jpg",
      })
    ).toThrow("Invalid Pandal.");
  });

  it("does not let a user-supplied path choose the folder", () => {
    expect(sanitizeFileName("pandals/other/festivals/x/expenses/y/hack.jpg", "receipt.jpg")).toBe(
      "hack.jpg"
    );
    expect(
      buildFestivalFilePath({
        pandalId: "pandal1",
        festivalId: "fest2026",
        category: "expenses",
        recordId: "exp1",
        fileName: "../../passwd",
      })
    ).toBe("pandals/pandal1/festivals/fest2026/expenses/exp1/passwd");
  });

  it("rejects a path from another Pandal or festival", () => {
    const path = "pandals/pandal1/festivals/fest2026/expenses/exp1/receipt.jpg";
    expect(() => assertOwnedFestivalPath(path, { pandalId: "pandal2", festivalId: "fest2026" })).toThrow(
      "That file does not belong to this festival."
    );
    expect(() => assertOwnedFestivalPath(path, { pandalId: "pandal1", festivalId: "fest2027" })).toThrow(
      "That file does not belong to this festival."
    );
    expect(() =>
      assertOwnedFestivalPath("pandals/pandal1/festivals/fest2026/../fest2027/x", {
        pandalId: "pandal1",
        festivalId: "fest2026",
      })
    ).toThrow();
  });

  it("builds a Pandal-level asset path without a festival", () => {
    expect(
      buildPandalAssetPath({
        pandalId: "pandal1",
        assetId: "asset1",
        fileName: "chair.jpg",
      })
    ).toBe("pandals/pandal1/assets/asset1/chair.jpg");
    expect(isPandalAssetPath("pandals/pandal1/assets/asset1/chair.jpg")).toBe(true);
    expect(isPandalAssetPath("pandals/pandal1/festivals/fest2026/expenses/exp1/receipt.jpg")).toBe(
      false
    );
    expect(() =>
      assertOwnedPandalAssetPath("pandals/pandal2/assets/asset1/chair.jpg", { pandalId: "pandal1" })
    ).toThrow("That file does not belong to this Pandal.");
  });

  it("builds a Pandal-level sponsor path without a festival", () => {
    expect(
      buildPandalSponsorPath({
        pandalId: "pandal1",
        sponsorId: "sponsor1",
        fileName: "photo.jpg",
      })
    ).toBe("pandals/pandal1/sponsors/sponsor1/photo.jpg");
    expect(isPandalSponsorPath("pandals/pandal1/sponsors/sponsor1/photo.jpg")).toBe(true);
    expect(isPandalSponsorPath("pandals/pandal1/assets/asset1/chair.jpg")).toBe(false);
    expect(() =>
      assertOwnedPandalSponsorPath("pandals/pandal2/sponsors/sponsor1/photo.jpg", {
        pandalId: "pandal1",
      })
    ).toThrow("That file does not belong to this Pandal.");
  });

  it("ignores legacy public Firebase URLs", () => {
    expect(ganeshStoredPath(undefined, "https://firebasestorage.googleapis.com/v0/b/x")).toBeUndefined();
    expect(
      ganeshStoredPath({ path: "pandals/pandal1/festivals/fest2026/expenses/exp1/receipt.jpg" })
    ).toBe("pandals/pandal1/festivals/fest2026/expenses/exp1/receipt.jpg");
  });
});
