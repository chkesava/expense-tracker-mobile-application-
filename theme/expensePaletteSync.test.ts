import { describe, expect, it } from "vitest";

import { acceptRemotePalette, acceptStoredPalette, createPendingPalette } from "./expensePaletteSync";

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

describe("pending palette tracker (SPENDLY-618)", () => {
  it("protects the newest selection when an older write finishes first (A → B → A)", () => {
    const pending = createPendingPalette();
    const a = pending.begin("u1", "midnight-emerald");
    const b = pending.begin("u1", "midnight-forest");
    const a2 = pending.begin("u1", "midnight-emerald");

    pending.complete(a);
    pending.complete(b);
    expect(pending.pendingFor("u1")).toBe("midnight-emerald");
    // A stale Forest snapshot is still rejected.
    expect(acceptRemotePalette("midnight-forest", pending.pendingFor("u1"))).toBeNull();

    pending.complete(a2);
    expect(pending.pendingFor("u1")).toBeNull();
    expect(acceptRemotePalette("midnight-forest", pending.pendingFor("u1"))).toBe("midnight-forest");
  });

  it("never blocks another account's palette", () => {
    const pending = createPendingPalette();
    pending.begin("account-a", "midnight-plum");
    expect(pending.pendingFor("account-b")).toBeNull();
    expect(acceptRemotePalette("midnight-cocoa", pending.pendingFor("account-b"))).toBe("midnight-cocoa");
    expect(pending.pendingFor("account-a")).toBe("midnight-plum");
  });
});
