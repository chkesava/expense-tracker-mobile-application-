import { describe, expect, it } from "vitest";

import { compactAmount, compactAmountNumber } from "./compactAmount";

describe("compactAmount (SPENDLY-572)", () => {
  it("uses lakhs and crores for rupees", () => {
    expect(compactAmount(1_020_000)).toBe("₹10.20L");
    expect(compactAmount(178_000)).toBe("₹1.78L");
    expect(compactAmount(23_450_000)).toBe("₹2.35Cr");
    expect(compactAmount(100_000)).toBe("₹1.00L");
  });

  it("shows whole rupees below a lakh", () => {
    expect(compactAmount(92_450.6)).toBe("₹92,451");
    expect(compactAmount(0)).toBe("₹0");
  });

  it("keeps the sign in front of the symbol", () => {
    expect(compactAmount(-40_939.71)).toBe("-₹40,940");
    expect(compactAmount(-1_780_000)).toBe("-₹17.80L");
  });

  it("uses K/M/B for other currencies", () => {
    expect(compactAmountNumber(12_500, "USD")).toBe("12.5K");
    expect(compactAmountNumber(3_200_000, "USD")).toBe("3.2M");
    expect(compactAmountNumber(9_999, "USD")).toBe("9,999");
    expect(compactAmountNumber(2_000_000_000, "EUR")).toBe("2B");
  });

  it("never throws on non-finite input", () => {
    expect(compactAmountNumber(Number.NaN)).toBe("0");
  });
});
