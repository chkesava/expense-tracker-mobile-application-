import { describe, expect, it } from "vitest";

import { normalizeMerchantName } from "@/services/sms/smsMerchantNormalizer";
import { parseBankSms } from "@/services/sms/smsParser";

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

describe("parseBankSms merchant normalization", () => {
  it("normalizes SWIGGY*ORDER in a debit SMS to Swiggy", () => {
    const parsed = parseBankSms({
      id: "n1",
      address: "VK-SBIINB",
      body: "Your A/c XX4521 has been debited for Rs.450 towards SWIGGY*ORDER via UPI. -SBI",
      receivedAtMs: Date.parse("2026-08-12T10:00:00+05:30"),
    });
    expect(parsed.merchant).toBe("Swiggy");
    expect(parsed.merchantRaw?.toUpperCase()).toContain("SWIGGY");
    expect(parsed.note).toMatch(/^Swiggy/);
    expect(parsed.templateId).toBe("phase7-parser");
  });
});
