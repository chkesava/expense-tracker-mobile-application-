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
    it("applies when loaded and no local write is pending", () => {
      expect(acceptRemotePalette("midnight-plum", null, true)).toBe("midnight-plum");
    });

    it("ignores the document until it has loaded for the signed-in account", () => {
      // Mid account switch the provider still holds the previous account's data.
      expect(acceptRemotePalette("midnight-plum", null, false)).toBeNull();
    });

    it("resets to Slate when the loaded account has no saved palette", () => {
      expect(acceptRemotePalette(undefined, null, true)).toBe("midnight-emerald");
      expect(acceptRemotePalette("light", null, true)).toBe("midnight-emerald");
    });

    it("skips an older snapshot while a newer selection is being written", () => {
      // Picked Forest, then Cocoa; the Forest snapshot lands late.
      expect(acceptRemotePalette("midnight-forest", "midnight-cocoa", true)).toBeNull();
      // Nor does a snapshot without the field reset a pending selection.
      expect(acceptRemotePalette(undefined, "midnight-cocoa", true)).toBeNull();
    });

    it("applies the snapshot that matches the pending selection (A → B → A)", () => {
      expect(acceptRemotePalette("midnight-emerald", "midnight-emerald", true)).toBe("midnight-emerald");
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
    expect(acceptRemotePalette("midnight-forest", pending.pendingFor("u1"), true)).toBeNull();

    pending.complete(a2);
    expect(pending.pendingFor("u1")).toBeNull();
    expect(acceptRemotePalette("midnight-forest", pending.pendingFor("u1"), true)).toBe("midnight-forest");
  });

  it("never blocks another account's palette", () => {
    const pending = createPendingPalette();
    pending.begin("account-a", "midnight-plum");
    expect(pending.pendingFor("account-b")).toBeNull();
    expect(acceptRemotePalette("midnight-cocoa", pending.pendingFor("account-b"), true)).toBe("midnight-cocoa");
    expect(pending.pendingFor("account-a")).toBe("midnight-plum");
  });

  it("keeps each account's pending write when switching accounts mid-write", () => {
    const pending = createPendingPalette();
    const a = pending.begin("account-a", "midnight-plum");
    const b = pending.begin("account-b", "midnight-forest");
    // Back on A before A's write ran: A's older cached snapshot is still rejected.
    expect(acceptRemotePalette("midnight-cocoa", pending.pendingFor("account-a"), true)).toBeNull();
    pending.complete(b);
    expect(pending.pendingFor("account-a")).toBe("midnight-plum");
    pending.complete(a);
    expect(pending.pendingFor("account-a")).toBeNull();
  });
});
