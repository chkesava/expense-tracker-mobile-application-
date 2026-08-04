import { describe, expect, it } from "vitest";
import {
  computeInterestValuation,
  countMonthlyCredits,
  getMutualFundValue,
} from "./investmentInterest";
import type { Investment } from "../types/investment";

describe("countMonthlyCredits", () => {
  it("counts one month after start on the 1st", () => {
    expect(countMonthlyCredits("2025-01-01", "2025-01-31")).toBe(1);
  });

  it("counts twelve months in a year", () => {
    expect(countMonthlyCredits("2025-01-01", "2025-12-31")).toBe(12);
  });
});

describe("computeInterestValuation", () => {
  it("FD simple monthly: ~50 after one month on 10k @ 6%", () => {
    const v = computeInterestValuation(
      10000,
      6,
      "simple",
      "monthly",
      "2025-01-01",
      "2025-01-31"
    );
    expect(v.accruedInterest).toBeCloseTo(50, 0);
    expect(v.totalValue).toBeCloseTo(10050, 0);
  });

  it("FD simple monthly: ~600 after twelve months", () => {
    const v = computeInterestValuation(
      10000,
      6,
      "simple",
      "monthly",
      "2025-01-01",
      "2025-12-31"
    );
    expect(v.accruedInterest).toBeCloseTo(600, 0);
  });

  it("compound daily increases balance above principal", () => {
    const v = computeInterestValuation(
      10000,
      6.2,
      "compound",
      "daily",
      "2025-01-01",
      "2025-06-30"
    );
    expect(v.totalValue).toBeGreaterThan(10000);
    expect(v.accruedInterest).toBe(v.totalValue - 10000);
  });
});

describe("getMutualFundValue", () => {
  it("uses current NAV when set", () => {
    const inv: Investment = {
      id: "1",
      name: "Test Fund",
      kind: "mutual_fund",
      principal: 5000,
      startDate: "2025-01-01",
      units: 100,
      purchaseNav: 50,
      currentNav: 52,
      status: "active",
    };
    expect(getMutualFundValue(inv)).toBe(5200);
  });
});
