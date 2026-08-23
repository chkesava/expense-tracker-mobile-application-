import { describe, expect, it } from "vitest";

import {
  assertOwnedFestivalPath,
  assertSafeId,
  buildFestivalFilePath,
  ganeshStoredPath,
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

  it("ignores legacy public Firebase URLs", () => {
    expect(ganeshStoredPath(undefined, "https://firebasestorage.googleapis.com/v0/b/x")).toBeUndefined();
    expect(
      ganeshStoredPath({ path: "pandals/pandal1/festivals/fest2026/expenses/exp1/receipt.jpg" })
    ).toBe("pandals/pandal1/festivals/fest2026/expenses/exp1/receipt.jpg");
  });
});
