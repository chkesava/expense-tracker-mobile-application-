import { describe, expect, it } from "vitest";

import { formatAmount } from "./formatCurrency";
import { GHOST_AMOUNT, ghostMoney } from "./ghostMoney";

describe("ghostMoney", () => {
  it("formats normally when ghost mode is off", () => {
    expect(ghostMoney(1234.5, "INR", false)).toBe(formatAmount(1234.5, "INR"));
    expect(ghostMoney(99, "USD", undefined)).toBe(formatAmount(99, "USD"));
  });

  it("masks the amount when ghost mode is on", () => {
    expect(ghostMoney(1234.5, "INR", true)).toBe(GHOST_AMOUNT);
    expect(ghostMoney(0, "INR", true)).toBe(GHOST_AMOUNT);
  });

  it("keeps the sign of a negative amount when masked", () => {
    expect(ghostMoney(-450, "INR", true)).toBe(`-${GHOST_AMOUNT}`);
  });
});
