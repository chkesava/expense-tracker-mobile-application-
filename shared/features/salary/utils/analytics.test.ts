import { describe, expect, it } from "vitest";

import type { SalaryRecord } from "../types";
import { buildSalaryAnalytics } from "./analytics";

function makeRecord(
  id: string,
  month: string,
  netAmount: number,
  type: "regular" | "bonus" = "regular",
  status: "confirmed" | "detected" | "manual" = "confirmed",
  employerName = "Acme Corp"
): SalaryRecord {
  return {
    id,
    month,
    payPeriod: {
      month,
      startDate: `${month}-01`,
      endDate: `${month}-30`,
    },
    employer: {
      name: employerName,
    },
    netAmount,
    currency: "INR",
    paymentDate: `${month}-28`,
    type,
    status,
    provenance: { source: "user_confirmed" },
    createdAtMs: 1729000000000,
    updatedAtMs: 1729000000000,
  };
}

describe("Salary Analytics Engine (SPENDLY-330)", () => {
  it("calculates Month-over-Month (MoM) growth from confirmed records", () => {
    const records: SalaryRecord[] = [
      makeRecord("rec_1", "2026-09", 100000),
      makeRecord("rec_2", "2026-10", 110000),
    ];

    const result = buildSalaryAnalytics(records, { targetMonth: "2026-10" });

    expect(result.hasSufficientHistory).toBe(true);
    expect(result.mom.hasPreviousData).toBe(true);
    expect(result.mom.regular).toBeDefined();
    expect(result.mom.regular?.current).toBe(110000);
    expect(result.mom.regular?.previous).toBe(100000);
    expect(result.mom.regular?.diff).toBe(10000);
    expect(result.mom.regular?.pct).toBe(10);
    expect(result.mom.regular?.direction).toBe("up");
    expect(result.mom.explanation).toContain("+10%");
  });

  it("filters out unreviewed 'detected' records by default (canonicalOnly: true)", () => {
    const records: SalaryRecord[] = [
      makeRecord("rec_1", "2026-09", 100000, "regular", "confirmed"),
      makeRecord("rec_2", "2026-10", 120000, "regular", "detected"), // not confirmed yet
    ];

    const canonicalResult = buildSalaryAnalytics(records);
    // Only 1 canonical month, so insufficient for MoM
    expect(canonicalResult.series).toHaveLength(1);
    expect(canonicalResult.mom.hasPreviousData).toBe(false);

    // With canonicalOnly: false, detected record is included
    const allResult = buildSalaryAnalytics(records, { canonicalOnly: false });
    expect(allResult.series).toHaveLength(2);
    expect(allResult.mom.hasPreviousData).toBe(true);
    expect(allResult.mom.regular?.pct).toBe(20);
  });

  it("isolates variable pay (bonuses) from regular base salary trend", () => {
    const records: SalaryRecord[] = [
      makeRecord("rec_sep", "2026-09", 100000, "regular"),
      makeRecord("rec_oct_reg", "2026-10", 100000, "regular"),
      makeRecord("rec_oct_bonus", "2026-10", 200000, "bonus"), // ₹2 lakh Diwali bonus
      makeRecord("rec_nov", "2026-11", 100000, "regular"),
    ];

    // Check October (month with bonus)
    const octResult = buildSalaryAnalytics(records, { targetMonth: "2026-10" });
    expect(octResult.mom.regular?.pct).toBe(0); // Regular pay didn't change!
    expect(octResult.mom.total?.pct).toBe(200); // Total net pay spiked by 200%

    // Check November (month after bonus)
    const novResult = buildSalaryAnalytics(records, { targetMonth: "2026-11" });
    expect(novResult.mom.regular?.pct).toBe(0); // Base pay remains steady at 0% change!
    expect(novResult.mom.total?.pct).toBe(-66.67); // Total net drops back down
  });

  it("indicates insufficient history when previous month is missing for MoM", () => {
    const records: SalaryRecord[] = [
      makeRecord("rec_1", "2026-07", 100000),
      makeRecord("rec_2", "2026-10", 105000), // Gap in Aug/Sep
    ];

    const result = buildSalaryAnalytics(records, { targetMonth: "2026-10" });
    expect(result.mom.hasPreviousData).toBe(false);
    expect(result.mom.insufficientHistoryReason).toContain("Preceding month (2026-09) not recorded");
  });

  it("calculates Year-over-Year (YoY) growth when 12+ months history exists", () => {
    const records: SalaryRecord[] = [
      makeRecord("rec_2025", "2025-10", 80000),
      makeRecord("rec_2026_09", "2026-09", 95000),
      makeRecord("rec_2026_10", "2026-10", 100000),
    ];

    const result = buildSalaryAnalytics(records, { targetMonth: "2026-10" });
    expect(result.yoy.hasLastYearData).toBe(true);
    expect(result.yoy.regular?.current).toBe(100000);
    expect(result.yoy.regular?.previous).toBe(80000);
    expect(result.yoy.regular?.diff).toBe(20000);
    expect(result.yoy.regular?.pct).toBe(25);
    expect(result.yoy.regular?.direction).toBe("up");
    expect(result.yoy.explanation).toContain("25%");
  });

  it("indicates insufficient history for YoY when prior year month is missing", () => {
    const records: SalaryRecord[] = [
      makeRecord("rec_1", "2026-08", 90000),
      makeRecord("rec_2", "2026-09", 95000),
      makeRecord("rec_3", "2026-10", 100000),
    ];

    const result = buildSalaryAnalytics(records, { targetMonth: "2026-10" });
    expect(result.yoy.hasLastYearData).toBe(false);
    expect(result.yoy.insufficientHistoryReason).toContain("No salary recorded for October 2025");
  });

  it("evaluates income stability index and variance", () => {
    // 1. Highly stable fixed salary (CV = 0)
    const stableRecords: SalaryRecord[] = [
      makeRecord("rec_1", "2026-05", 100000),
      makeRecord("rec_2", "2026-06", 100000),
      makeRecord("rec_3", "2026-07", 100000),
      makeRecord("rec_4", "2026-08", 100000),
      makeRecord("rec_5", "2026-09", 100000),
      makeRecord("rec_6", "2026-10", 100000),
    ];
    const stableResult = buildSalaryAnalytics(stableRecords);
    expect(stableResult.stability.classification).toBe("high_stability");
    expect(stableResult.stability.classificationLabel).toBe("Highly Stable");
    expect(stableResult.stability.coefficientOfVariation).toBe(0);

    // 2. Variable fluctuating income (CV > 0.20)
    const volatileRecords: SalaryRecord[] = [
      makeRecord("v_1", "2026-05", 40000),
      makeRecord("v_2", "2026-06", 140000),
      makeRecord("v_3", "2026-07", 30000),
      makeRecord("v_4", "2026-08", 110000),
    ];
    const volatileResult = buildSalaryAnalytics(volatileRecords);
    expect(volatileResult.stability.classification).toBe("variable_income");
    expect(volatileResult.stability.classificationLabel).toBe("Variable Income");
    expect(volatileResult.stability.coefficientOfVariation).toBeGreaterThan(0.20);

    // 3. Insufficient data (< 3 paychecks)
    const shortRecords: SalaryRecord[] = [
      makeRecord("s_1", "2026-09", 100000),
      makeRecord("s_2", "2026-10", 100000),
    ];
    const shortResult = buildSalaryAnalytics(shortRecords);
    expect(shortResult.stability.classification).toBe("insufficient_data");
    expect(shortResult.stability.insufficientHistoryReason).toBeDefined();
  });

  it("calculates rolling 3-month and 6-month baselines", () => {
    const records: SalaryRecord[] = [
      makeRecord("b_1", "2026-05", 90000),
      makeRecord("b_2", "2026-06", 90000),
      makeRecord("b_3", "2026-07", 90000),
      makeRecord("b_4", "2026-08", 90000),
      makeRecord("b_5", "2026-09", 90000),
      makeRecord("b_6", "2026-10", 99000), // 10% increase in Oct
    ];

    const result = buildSalaryAnalytics(records, { targetMonth: "2026-10" });
    expect(result.baseline.rolling3MonthAvg).toBe(93000); // (90 + 90 + 99) / 3 = 93
    expect(result.baseline.rolling6MonthAvg).toBe(91500); // (90*5 + 99) / 6 = 91.5
    expect(result.baseline.vsRolling6MonthDiff).toBe(7500); // 99000 - 91500
    expect(result.baseline.vsRolling6MonthPct).toBe(8.2); // (7500 / 91500) * 100
  });

  it("allows filtering analytics by employer", () => {
    const records: SalaryRecord[] = [
      makeRecord("a_1", "2026-09", 100000, "regular", "confirmed", "Employer A"),
      makeRecord("a_2", "2026-10", 110000, "regular", "confirmed", "Employer A"),
      makeRecord("b_1", "2026-10", 50000, "regular", "confirmed", "Employer B"),
    ];

    const filtered = buildSalaryAnalytics(records, { employerName: "Employer A" });
    expect(filtered.series).toHaveLength(2);
    expect(filtered.mom.regular?.pct).toBe(10);
  });
});
