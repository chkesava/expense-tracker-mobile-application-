import { describe, expect, it } from "vitest";

import type { SalaryRecord } from "../types";
import { buildSalaryForecast } from "./forecast";

function makeRecord(
  id: string,
  month: string,
  netAmount: number,
  paymentDate: string,
  type: "regular" | "bonus" = "regular",
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
    employer: { name: employerName },
    netAmount,
    currency: "INR",
    paymentDate,
    type,
    status: "confirmed",
    provenance: { source: "user_confirmed" },
    createdAtMs: 1729000000000,
    updatedAtMs: 1729000000000,
  };
}

describe("Salary Forecast & Expected Income Planning Engine (SPENDLY-332)", () => {
  it("projects upcoming regular paycheck amount and date accurately", () => {
    const records: SalaryRecord[] = [
      makeRecord("r1", "2026-07", 100000, "2026-07-28"),
      makeRecord("r2", "2026-08", 100000, "2026-08-28"),
      makeRecord("r3", "2026-09", 100000, "2026-09-28"),
      makeRecord("r4", "2026-10", 100000, "2026-10-28"),
    ];

    // Today is Nov 10, 2026 (Nov paycheck expected on ~Nov 28)
    const forecast = buildSalaryForecast(records, {
      todayKey: "2026-11-10",
      monthsAhead: 3,
    });

    expect(forecast.hasSufficientData).toBe(true);
    expect(forecast.primaryEmployer).toBe("Acme Corp");
    expect(forecast.baselineRegularNet).toBe(100000);

    const next = forecast.nextExpectedPaycheck;
    expect(next).toBeDefined();
    expect(next?.wageMonth).toBe("2026-11");
    expect(next?.expectedDate).toBe("2026-11-28");
    expect(next?.projectedRegularNet).toBe(100000);
    expect(next?.projectedTotalNet).toBe(100000);
    expect(next?.isEstimate).toBe(true);
    expect(next?.confidence).toBe("medium"); // 4 records
    expect(next?.assumptions.length).toBeGreaterThan(0);

    // Multi-month sequence: Nov 2026, Dec 2026, Jan 2027
    expect(forecast.upcomingProjections).toHaveLength(3);
    expect(forecast.upcomingProjections.map((p) => p.wageMonth)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
    ]);
  });

  it("handles variable pay conservatively (zero bonus assumed in base projection)", () => {
    const records: SalaryRecord[] = [
      makeRecord("r1", "2026-08", 100000, "2026-08-28"),
      makeRecord("r2", "2026-09", 100000, "2026-09-28"),
      makeRecord("bonus", "2026-09", 120000, "2026-09-15", "bonus"), // ₹1.2L bonus
      makeRecord("r3", "2026-10", 100000, "2026-10-28"),
    ];

    const forecast = buildSalaryForecast(records, { todayKey: "2026-11-10" });

    // Baseline stays strictly at regular net pay
    expect(forecast.baselineRegularNet).toBe(100000);
    expect(forecast.nextExpectedPaycheck?.projectedRegularNet).toBe(100000);
    expect(forecast.nextExpectedPaycheck?.projectedVariableNet).toBe(0);
    expect(forecast.nextExpectedPaycheck?.projectedTotalNet).toBe(100000);

    // Bonus is tracked as informational context only
    expect(forecast.historicalBonusAverageMonthly).toBeGreaterThan(0);
  });

  it("advances forecast to next month if current month is already received", () => {
    const records: SalaryRecord[] = [
      makeRecord("r1", "2026-08", 100000, "2026-08-28"),
      makeRecord("r2", "2026-09", 100000, "2026-09-28"),
      makeRecord("r3", "2026-10", 100000, "2026-10-28"),
      makeRecord("r4", "2026-11", 100000, "2026-11-28"), // Nov already paid!
    ];

    const forecast = buildSalaryForecast(records, { todayKey: "2026-11-29" });

    // Since Nov is already paid, next expected is December 2026
    expect(forecast.nextExpectedPaycheck?.wageMonth).toBe("2026-12");
    expect(forecast.nextExpectedPaycheck?.expectedDate).toBe("2026-12-28");
  });

  it("handles next_month payment timing correctly (e.g. paid on 1st-5th of next month)", () => {
    const records: SalaryRecord[] = [
      makeRecord("r1", "2026-08", 120000, "2026-09-02"),
      makeRecord("r2", "2026-09", 120000, "2026-10-02"),
      makeRecord("r3", "2026-10", 120000, "2026-11-02"), // Paid on Nov 2 for Oct
    ];

    // Today is Nov 10, 2026. Oct was paid on Nov 2. Next is Nov wages (paid Dec 2)
    const forecast = buildSalaryForecast(records, { todayKey: "2026-11-10" });

    expect(forecast.nextExpectedPaycheck?.wageMonth).toBe("2026-11");
    expect(forecast.nextExpectedPaycheck?.expectedDate).toBe("2026-12-02");
  });

  it("returns explicit insufficient_data state when < 2 regular paychecks", () => {
    const records: SalaryRecord[] = [
      makeRecord("r1", "2026-10", 100000, "2026-10-28"),
    ];

    const forecast = buildSalaryForecast(records, { todayKey: "2026-11-10" });

    expect(forecast.hasSufficientData).toBe(false);
    expect(forecast.nextExpectedPaycheck).toBeNull();
    expect(forecast.upcomingProjections).toHaveLength(0);
    expect(forecast.insufficientHistoryReason).toContain("Requires at least 2 confirmed regular paychecks");
  });

  it("explicitly marks all projections as estimates with legal disclaimer", () => {
    const records: SalaryRecord[] = [
      makeRecord("r1", "2026-09", 100000, "2026-09-28"),
      makeRecord("r2", "2026-10", 100000, "2026-10-28"),
    ];

    const forecast = buildSalaryForecast(records, { todayKey: "2026-11-10" });

    expect(forecast.disclaimer).toContain("This forecast is an estimate");
    expect(forecast.disclaimer).toContain("Future income is not guaranteed");
    expect(forecast.nextExpectedPaycheck?.isEstimate).toBe(true);
  });

  it("produces valid calendar integration handoff payload", () => {
    const records: SalaryRecord[] = [
      makeRecord("r1", "2026-08", 100000, "2026-08-28"),
      makeRecord("r2", "2026-09", 100000, "2026-09-28"),
      makeRecord("r3", "2026-10", 100000, "2026-10-28"),
    ];

    const forecast = buildSalaryForecast(records, { todayKey: "2026-11-10" });
    const handoff = forecast.nextExpectedPaycheck?.calendarHandoff;

    expect(handoff).toBeDefined();
    expect(handoff?.source).toBe("salary");
    expect(handoff?.direction).toBe("in");
    expect(handoff?.state).toBe("projected");
    expect(handoff?.amount).toBe(100000);
    expect(handoff?.date).toBe("2026-11-28");
    expect(handoff?.title).toContain("Acme Corp");
    expect(handoff?.deepLink).toBe("/salary?month=2026-11");
  });
});
