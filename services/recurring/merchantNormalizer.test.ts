import { describe, expect, it } from "vitest";

import { normalizeMerchantName } from "@/services/recurring/merchantNormalizer";

describe("normalizeMerchantName", () => {
  it.each([
    ["SWIGGYIN", "Swiggy"],
    ["SWIGGY LIMITED", "Swiggy"],
    ["SWIGGY", "Swiggy"],
    ["SWIGGY*ORDER", "Swiggy"],
    ["Swiggy Instamart", "Swiggy"],
    ["AMAZON PAY", "Amazon"],
    ["Amazon.in", "Amazon"],
    ["UBER*TRIP", "Uber"],
    ["ZOMATOIN", "Zomato"],
    ["Zomato Limited", "Zomato"],
  ])("maps %s → %s", (raw, canonical) => {
    const result = normalizeMerchantName(raw);
    expect(result.merchant).toBe(canonical);
    expect(result.matched).toBe(true);
    expect(result.merchantRaw).toBe(raw);
  });

  it("title-cases unknown merchants without dropping them", () => {
    const result = normalizeMerchantName("BLUE TOKAI COFFEE");
    expect(result.matched).toBe(false);
    expect(result.merchant).toBe("Blue Tokai Coffee");
  });

  it("returns empty for blank input", () => {
    expect(normalizeMerchantName("")).toEqual({ matched: false });
  });
});
