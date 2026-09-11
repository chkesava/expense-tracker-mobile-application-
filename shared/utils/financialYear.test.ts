import { describe, expect, it } from "vitest";

import {
  compareFinancialYears,
  financialYearBounds,
  financialYearLabel,
  financialYearMonths,
  financialYearOfMonth,
} from "@/shared/utils/financialYear";

describe("financialYearOfMonth", () => {
  it("starts a new financial year in April", () => {
    expect(financialYearOfMonth("2021-04")).toBe("2021-22");
  });

  it("keeps March in the previous financial year", () => {
    expect(financialYearOfMonth("2022-03")).toBe("2021-22");
  });

  it("handles both ends of a calendar year", () => {
    expect(financialYearOfMonth("2021-12")).toBe("2021-22");
    expect(financialYearOfMonth("2022-01")).toBe("2021-22");
  });

  it("pads a century-boundary end year to two digits", () => {
    expect(financialYearOfMonth("2099-04")).toBe("2099-00");
  });

  it("returns an empty string for a malformed key rather than guessing", () => {
    expect(financialYearOfMonth("2021")).toBe("");
    expect(financialYearOfMonth("")).toBe("");
  });
});

describe("financialYearBounds and months", () => {
  it("spans April through the following March", () => {
    expect(financialYearBounds("2021-22")).toEqual({
      startMonth: "2021-04",
      endMonth: "2022-03",
    });
  });

  it("lists twelve months starting at April", () => {
    const months = financialYearMonths("2021-22");
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2021-04");
    expect(months[11]).toBe("2022-03");
  });

  it("returns an empty list for a malformed year", () => {
    expect(financialYearMonths("nope")).toEqual([]);
  });

  it("every generated month maps back to its own financial year", () => {
    for (const month of financialYearMonths("2021-22")) {
      expect(financialYearOfMonth(month)).toBe("2021-22");
    }
  });
});

describe("financialYearLabel", () => {
  it("prefixes with FY", () => {
    expect(financialYearLabel("2021-22")).toBe("FY 2021-22");
  });

  it("stays empty for an empty year", () => {
    expect(financialYearLabel("")).toBe("");
  });
});

describe("compareFinancialYears", () => {
  it("orders chronologically", () => {
    expect(compareFinancialYears("2020-21", "2021-22")).toBeLessThan(0);
    expect(compareFinancialYears("2022-23", "2021-22")).toBeGreaterThan(0);
    expect(compareFinancialYears("2021-22", "2021-22")).toBe(0);
  });
});
