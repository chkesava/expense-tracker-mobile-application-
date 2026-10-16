import { describe, expect, it } from "vitest";
import {
  currencySymbol,
  formatAmount,
  formatAmountNumber,
  signedCurrencyPrefix,
} from "./formatCurrency";

describe("formatCurrency", () => {
  it("resolves currency symbols", () => {
    expect(currencySymbol("INR")).toBe("₹");
    expect(currencySymbol("USD")).toBe("$");
  });

  it("formats integers without forced decimals", () => {
    expect(formatAmountNumber(1234, "INR")).toBe("1,234");
  });

  it("formats with currency prefix", () => {
    expect(formatAmount(1500, "INR")).toBe("₹1,500");
  });

  it("respects custom prefix", () => {
    expect(formatAmount(10, "INR", { prefix: "" })).toBe("10");
  });
});

describe("signedCurrencyPrefix", () => {
  it("keeps the currency symbol after the sign", () => {
    expect(formatAmount(112, "INR", { prefix: signedCurrencyPrefix("-", "INR") })).toBe("-₹112");
    expect(signedCurrencyPrefix("+", "USD")).toBe("+$");
  });

  it("falls back to INR when no currency is given", () => {
    expect(signedCurrencyPrefix("-", "")).toBe("-₹");
  });
});
