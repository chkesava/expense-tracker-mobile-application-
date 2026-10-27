import { describe, expect, it } from "vitest";

import { acceptRemotePalette, acceptStoredPalette } from "./expensePaletteSync";

describe("Expense palette sync ordering (SPENDLY-618)", () => {
  describe("startup AsyncStorage read", () => {
    it("applies when nothing newer has set the palette", () => {
      expect(acceptStoredPalette("midnight-forest", false)).toBe("midnight-forest");
    });

    it("never replaces a palette from the user doc or a selection", () => {
      expect(acceptStoredPalette("midnight-forest", true)).toBeNull();
    });

    it("ignores unknown values", () => {
      expect(acceptStoredPalette("dark", false)).toBeNull();
      expect(acceptStoredPalette(null, false)).toBeNull();
    });
  });

  describe("user-doc snapshot", () => {
    it("applies when no local write is pending", () => {
      expect(acceptRemotePalette("midnight-plum", null)).toBe("midnight-plum");
    });

    it("skips an older snapshot while a newer selection is being written", () => {
      // Picked Forest, then Cocoa; the Forest snapshot lands late.
      expect(acceptRemotePalette("midnight-forest", "midnight-cocoa")).toBeNull();
    });

    it("applies the snapshot that matches the pending selection (A → B → A)", () => {
      expect(acceptRemotePalette("midnight-emerald", "midnight-emerald")).toBe("midnight-emerald");
    });

    it("ignores missing or unknown values", () => {
      expect(acceptRemotePalette(undefined, null)).toBeNull();
      expect(acceptRemotePalette("light", null)).toBeNull();
    });
  });
});
