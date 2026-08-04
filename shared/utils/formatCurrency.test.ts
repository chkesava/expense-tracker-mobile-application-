import { describe, expect, it } from "vitest";
import {
  currencySymbol,
  formatAmount,
  formatAmountNumber,
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
