import { describe, expect, it } from "vitest";

import {
  EPF_INTEREST_RATES,
  earliestRatedFinancialYear,
  findEpfInterestRate,
} from "@/shared/features/epf/data/epfInterestRates";

describe("EPF_INTEREST_RATES table", () => {
  it("is ordered newest first", () => {
    for (let i = 1; i < EPF_INTEREST_RATES.length; i += 1) {
      expect(
        EPF_INTEREST_RATES[i].financialYear < EPF_INTEREST_RATES[i - 1].financialYear
      ).toBe(true);
    }
  });

  it("lists each financial year once", () => {
    const years = EPF_INTEREST_RATES.map((rule) => rule.financialYear);
    expect(new Set(years).size).toBe(years.length);
  });

  it("stores rates as fractions in a plausible range", () => {
    for (const rule of EPF_INTEREST_RATES) {
      expect(rule.rate).toBeGreaterThan(0.05);
      expect(rule.rate).toBeLessThan(0.15);
    }
  });
});

describe("findEpfInterestRate", () => {
  it("returns the declared rate for a known year", () => {
    expect(findEpfInterestRate("2023-24")?.rate).toBe(0.0825);
    expect(findEpfInterestRate("2021-22")?.rate).toBe(0.081);
  });

  it("returns null for a year EPFO has not declared", () => {
    // Not an error state: the current financial year always lacks a rate, and
    // so does the one just ended until EPFO announces it.
    expect(findEpfInterestRate("2030-31")).toBeNull();
  });

  it("returns null rather than guessing for a year before the table starts", () => {
    expect(findEpfInterestRate("1995-96")).toBeNull();
  });

  it("never throws on a malformed year", () => {
    expect(() => findEpfInterestRate("")).not.toThrow();
    expect(findEpfInterestRate("")).toBeNull();
  });
});

describe("earliestRatedFinancialYear", () => {
  it("names the oldest year the table can price", () => {
    expect(earliestRatedFinancialYear()).toBe(
      EPF_INTEREST_RATES[EPF_INTEREST_RATES.length - 1].financialYear
    );
  });
});
