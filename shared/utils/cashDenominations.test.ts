import { describe, expect, it } from "vitest";
import { CASH_DENOMINATIONS, cashDenominationTotal } from "./cashDenominations";

describe("cashDenominationTotal", () => {
  it("is 0 for undefined or empty input", () => {
    expect(cashDenominationTotal(undefined)).toBe(0);
    expect(cashDenominationTotal({})).toBe(0);
  });

  it("sums count * denomination", () => {
    expect(cashDenominationTotal({ "500": 2, "200": 1, "100": 5 })).toBe(
      500 * 2 + 200 * 1 + 100 * 5
    );
  });

  it("covers every declared denomination", () => {
    const counts = Object.fromEntries(
      CASH_DENOMINATIONS.map((d) => [String(d), 1])
    );
    expect(cashDenominationTotal(counts)).toBe(
      CASH_DENOMINATIONS.reduce((a, b) => a + b, 0)
    );
  });

  it("ignores negative, zero, non-integer, and non-finite counts", () => {
    expect(cashDenominationTotal({ "500": -1, "200": 0, "100": 1.9 })).toBe(
      100
    );
    expect(cashDenominationTotal({ "50": Number.NaN })).toBe(0);
    expect(cashDenominationTotal({ "50": Number.POSITIVE_INFINITY })).toBe(0);
  });
});
