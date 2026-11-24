import { describe, expect, it } from "vitest";
import {
  computeInterestValuation,
  countMonthlyCredits,
  getInvestmentValuation,
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

describe("getInvestmentValuation", () => {
  function fd(overrides: Partial<Investment> = {}): Investment {
    return {
      id: "fd1",
      name: "Test FD",
      kind: "fixed_deposit",
      principal: 100000,
      startDate: "2026-01-01",
      annualInterestRate: 7.25,
      interestMethod: "compound",
      creditFrequency: "quarterly",
      status: "active",
      ...overrides,
    };
  }

  it("shows real growth for a compound FD well before its stored frequency's first period completes", () => {
    // Quarterly would show 0 accrued interest after only 10 days; the live
    // estimate must match fd-interest-daily.ts, which credits daily
    // regardless of this field.
    const v = getInvestmentValuation(fd(), "2026-01-11");
    expect(v.totalValue).toBeGreaterThan(100000);
  });

  it("matches calling computeInterestValuation directly with daily, ignoring the stored frequency", () => {
    const investment = fd({ creditFrequency: "yearly" });
    const v = getInvestmentValuation(investment, "2026-01-11");
    const expected = computeInterestValuation(
      investment.principal,
      investment.annualInterestRate!,
      "compound",
      "daily",
      investment.startDate,
      "2026-01-11"
    );
    expect(v.totalValue).toBe(expected.totalValue);
  });

  it("leaves simple-interest investments on their own stored frequency", () => {
    const investment = fd({ interestMethod: "simple", creditFrequency: "monthly" });
    const v = getInvestmentValuation(investment, "2026-01-11");
    // Less than a month in: simple-monthly shows no credit yet.
    expect(v.accruedInterest).toBe(0);
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
