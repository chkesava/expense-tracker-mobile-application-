import { describe, expect, it } from "vitest";
import {
  computePositionMetrics,
  cryptoQuoteKey,
  mfQuoteKey,
  parseCryptoCoinId,
  parseMfSchemeCode,
} from "./market";

describe("computePositionMetrics", () => {
  it("computes invested, current, P&L and return %", () => {
    const m = computePositionMetrics(120, 10, 100);
    expect(m.currentValue).toBe(1200);
    expect(m.investedValue).toBe(1000);
    expect(m.profitLoss).toBe(200);
    expect(m.returnPercent).toBeCloseTo(20, 5);
  });

  it("returns 0% when invested value is 0", () => {
    const m = computePositionMetrics(50, 0, 100);
    expect(m.returnPercent).toBe(0);
    expect(m.currentValue).toBe(0);
  });

  it("handles losses", () => {
    const m = computePositionMetrics(80, 5, 100);
    expect(m.profitLoss).toBe(-100);
    expect(m.returnPercent).toBeCloseTo(-20, 5);
  });
});

describe("quote key helpers", () => {
  it("builds MF and CRYPTO keys", () => {
    expect(mfQuoteKey(125497)).toBe("MF:125497");
    expect(mfQuoteKey(" 119551 ")).toBe("MF:119551");
    expect(cryptoQuoteKey("Bitcoin")).toBe("CRYPTO:bitcoin");
  });

  it("parses MF scheme codes", () => {
    expect(parseMfSchemeCode("MF:125497")).toBe("125497");
    expect(parseMfSchemeCode("119551")).toBe("119551");
    expect(parseMfSchemeCode("RELIANCE.NS")).toBeNull();
  });

  it("parses crypto coin ids", () => {
    expect(parseCryptoCoinId("CRYPTO:ethereum")).toBe("ethereum");
    expect(parseCryptoCoinId("bitcoin")).toBe("bitcoin");
    expect(parseCryptoCoinId("RELIANCE.NS")).toBeNull();
  });
});
