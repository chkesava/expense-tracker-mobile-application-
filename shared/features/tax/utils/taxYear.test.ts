import { describe, expect, it } from "vitest";

import {
  assessmentYearOf,
  defaultTaxYear,
  financialYearDateBounds,
  financialYearForDate,
  isDateInFinancialYear,
  isFinancialYearKey,
  nextFinancialYear,
  previousFinancialYear,
  selectableTaxYears,
  taxLawOf,
  taxYearLabel,
  taxYearOf,
} from "./taxYear";

describe("isFinancialYearKey", () => {
  it("accepts consecutive years, including the century turn", () => {
    expect(isFinancialYearKey("2025-26")).toBe(true);
    expect(isFinancialYearKey("2099-00")).toBe(true);
  });

  it("rejects labels and non-consecutive years", () => {
    for (const bad of ["2025-27", "2025-6", "FY 2025-26", "2025-2026", "", 2025, null]) {
      expect(isFinancialYearKey(bad)).toBe(false);
    }
  });
});

describe("year boundaries", () => {
  it("puts 31 March in the year that ends and 1 April in the next", () => {
    expect(financialYearForDate("2026-03-31")).toBe("2025-26");
    expect(financialYearForDate("2026-04-01")).toBe("2026-27");
    expect(isDateInFinancialYear("2025-04-01", "2025-26")).toBe(true);
    expect(isDateInFinancialYear("2025-03-31", "2025-26")).toBe(false);
  });

  it("gives inclusive date bounds", () => {
    expect(financialYearDateBounds("2025-26")).toEqual({
      startDate: "2025-04-01",
      endDate: "2026-03-31",
    });
    expect(financialYearDateBounds("2025-27")).toBeNull();
  });

  it("steps between years", () => {
    expect(nextFinancialYear("2025-26")).toBe("2026-27");
    expect(previousFinancialYear("2025-26")).toBe("2024-25");
    expect(nextFinancialYear("2099-00")).toBe("2100-01");
  });
});

describe("law and assessment year", () => {
  it("keeps FY 2025-26 under the 1961 Act with AY 2026-27", () => {
    expect(taxLawOf("2025-26")).toBe("ITA1961");
    expect(assessmentYearOf("2025-26")).toBe("2026-27");
  });

  it("has no assessment year from FY 2026-27 (Income-tax Act, 2025)", () => {
    expect(taxLawOf("2026-27")).toBe("ITA2025");
    expect(assessmentYearOf("2026-27")).toBeNull();
    expect(taxYearOf("2026-27")).toEqual({
      fy: "2026-27",
      law: "ITA2025",
      ay: null,
      startDate: "2026-04-01",
      endDate: "2027-03-31",
    });
  });

  it("is null for a malformed key", () => {
    expect(taxLawOf("2026")).toBeNull();
    expect(taxYearOf("2026")).toBeNull();
  });
});

describe("taxYearLabel", () => {
  it("names a 1961-Act year by FY and AY", () => {
    expect(taxYearLabel("2025-26")).toBe("FY 2025-26 · AY 2026-27");
    expect(taxYearLabel("2025-26", "short")).toBe("FY 2025-26");
  });

  it("never shows an AY for a 2025-Act year", () => {
    expect(taxYearLabel("2026-27")).toBe("Tax year 2026-27");
    expect(taxYearLabel("2026-27", "short")).toBe("Tax year 2026-27");
    expect(taxYearLabel("2026-27")).not.toMatch(/AY|FY/);
  });

  it("is empty for a malformed key", () => {
    expect(taxYearLabel("FY 2025-26")).toBe("");
  });
});

describe("selectable years", () => {
  it("lists the current year back to the first supported one, newest first", () => {
    expect(selectableTaxYears("2026-11-07")).toEqual(["2026-27", "2025-26", "2024-25"]);
  });

  it("defaults to the year that ended last", () => {
    expect(defaultTaxYear("2026-11-07")).toBe("2025-26");
    expect(defaultTaxYear("2026-04-01")).toBe("2025-26");
    expect(defaultTaxYear("2026-03-31")).toBe("2024-25");
  });

  it("doesn't offer a year before the first supported one", () => {
    expect(selectableTaxYears("2024-06-01")).toEqual(["2024-25"]);
    expect(defaultTaxYear("2024-06-01")).toBe("2024-25");
  });

  it("is empty for a malformed date", () => {
    expect(selectableTaxYears("2026-13-01")).toEqual([]);
    expect(defaultTaxYear("")).toBe("");
  });
});
