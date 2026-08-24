import { describe, expect, it } from "vitest";

import { categorizeSmsMerchant } from "@/services/sms/smsCategorizer";
import { parseBankSms } from "@/services/sms/smsParser";

describe("categorizeSmsMerchant", () => {
  it.each([
    ["Swiggy", "Food", "Food Delivery"],
    ["Zomato", "Food", "Food Delivery"],
    ["Uber", "Travel", "Auto / Cab"],
    ["Amazon", "Shopping", "Online Shopping"],
    ["Netflix", "Entertainment", "OTT / Music"],
    ["Airtel", "Bills", "Mobile Recharge"],
  ])("maps %s → %s / %s", (merchant, category, subcategory) => {
    expect(categorizeSmsMerchant(merchant)).toEqual({
      category,
      subcategory,
      source: "merchant_rule",
    });
  });

  it("lets user keyword rules override the catalog", () => {
    expect(
      categorizeSmsMerchant("Swiggy", [
        { id: "1", keyword: "swiggy", category: "Work", subcategory: "Business Meals" },
      ])
    ).toEqual({
      category: "Work",
      subcategory: "Business Meals",
      source: "user_rule",
    });
  });

  it("returns null for unknown merchants", () => {
    expect(categorizeSmsMerchant("Blue Tokai Coffee")).toBeNull();
  });
});

describe("parseBankSms categorization", () => {
  it("sets Food on a Swiggy debit", () => {
    const parsed = parseBankSms({
      id: "c1",
      address: "VK-SBIINB",
      body: "Your A/c XX4521 has been debited for Rs.450 towards SWIGGY*ORDER via UPI. -SBI",
      receivedAtMs: Date.parse("2026-08-12T10:00:00+05:30"),
    });
    expect(parsed.merchant).toBe("Swiggy");
    expect(parsed.category).toBe("Food");
    expect(parsed.subcategory).toBe("Food Delivery");
    expect(parsed.templateId).toBe("phase7-parser");
  });
});
