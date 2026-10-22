import { describe, expect, it } from "vitest";

import type { MerchantResolution } from "../types/merchant";
import { MONOGRAM_PALETTE_SIZE, merchantMonogram, monogramInitials } from "./merchantMonogram";
import { resolveMerchant } from "./merchantResolve";

const res = (over: Partial<MerchantResolution>): MerchantResolution => ({
  merchantId: "swiggy",
  displayName: "Swiggy",
  confidence: "high",
  method: "alias_exact",
  rail: "unknown" as MerchantResolution["rail"],
  raw: "swiggy",
  normalized: "swiggy",
  ...over,
} as MerchantResolution);

describe("monogramInitials", () => {
  it("takes up to two leading letters", () => {
    expect(monogramInitials("Amazon Pay")).toBe("AP");
    expect(monogramInitials("zomato")).toBe("Z");
    expect(monogramInitials("7-Eleven")).toBe("7E");
    expect(monogramInitials("Bharat Petroleum Corp")).toBe("BP");
    expect(monogramInitials("  ")).toBeNull();
    expect(monogramInitials("!!!")).toBeNull();
  });
});

describe("merchantMonogram", () => {
  it("tiles only merchants the resolver is sure of, or the user named", () => {
    expect(merchantMonogram(res({ confidence: "high" }))).not.toBeNull();
    expect(merchantMonogram(res({ confidence: "medium", method: "rule" }))).not.toBeNull();
    expect(merchantMonogram(res({ confidence: "low", method: "context" }))).toBeNull();
    expect(merchantMonogram(res({ merchantId: null, confidence: "unknown", method: "unresolved" }))).toBeNull();
    expect(merchantMonogram(res({ merchantId: "custom:my-gym", displayName: "My Gym", confidence: "low", method: "user_override" }))).toMatchObject({ initials: "MG" });
    expect(merchantMonogram(null)).toBeNull();
  });

  it("gives each merchant a stable colour within the palette", () => {
    const a = merchantMonogram(res({ merchantId: "swiggy" }));
    const b = merchantMonogram(res({ merchantId: "swiggy", displayName: "SWIGGY" }));
    expect(a?.colorIndex).toBe(b?.colorIndex);
    for (const id of ["zomato", "amazon", "uber", "custom:x"]) {
      const m = merchantMonogram(res({ merchantId: id }));
      expect(m?.colorIndex).toBeGreaterThanOrEqual(0);
      expect(m?.colorIndex).toBeLessThan(MONOGRAM_PALETTE_SIZE);
    }
  });

  it("works on real registry resolutions and skips plain notes", () => {
    const tile = (text: string) => merchantMonogram(resolveMerchant({ refKey: "expense:e1", text, kind: "expense" }));
    expect(tile("Zomato")).toMatchObject({ merchantId: "zomato", initials: "Z" });
    expect(tile("SWIGGY ORDER 1234")).toMatchObject({ merchantId: "swiggy", initials: "S" });
    expect(tile("Groceries")).toBeNull();
  });
});
