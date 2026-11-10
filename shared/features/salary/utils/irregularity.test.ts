import { describe, expect, it } from "vitest";

import type { SalaryRecord } from "../types";
import {
  buildSalarySignalNotification,
  buildSignalId,
  detectSalaryIrregularities,
  filterActiveSalarySignals,
  learnPaydayProfile,
  type SalarySignal,
  type SalarySignalDismissal,
} from "./irregularity";

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

describe("Salary Irregularity & Payday Learning Engine (SPENDLY-331)", () => {
  it("learns expected payday window and baseline amount from history", () => {
    const history: SalaryRecord[] = [
      makeRecord("r1", "2026-06", 100000, "2026-06-29"),
      makeRecord("r2", "2026-07", 100000, "2026-07-30"),
      makeRecord("r3", "2026-08", 100000, "2026-08-31"),
      makeRecord("r4", "2026-09", 100000, "2026-09-30"),
      makeRecord("bonus", "2026-09", 50000, "2026-09-15", "bonus"), // variable pay
    ];

    const profile = learnPaydayProfile(history, "Acme Corp");

    expect(profile).toBeDefined();
    expect(profile?.sampleCount).toBe(4); // Excluded bonus!
    expect(profile?.typicalDay).toBe(30);
    expect(profile?.expectedWindow.timing).toBe("same_month");
    expect(profile?.expectedWindow.startDay).toBe(28); // 29 - 1
    expect(profile?.expectedWindow.endDay).toBe(31);
    expect(profile?.baselineRegularNet).toBe(100000);
    expect(profile?.hasSufficientData).toBe(true);
  });

  it("learns next_month payment timing when company pays on 1st-5th of next month", () => {
    const history: SalaryRecord[] = [
      makeRecord("r1", "2026-06", 120000, "2026-07-01"),
      makeRecord("r2", "2026-07", 120000, "2026-08-02"),
      makeRecord("r3", "2026-08", 120000, "2026-09-01"),
    ];

    const profile = learnPaydayProfile(history, "Acme Corp");

    expect(profile).toBeDefined();
    expect(profile?.typicalDay).toBe(1);
    expect(profile?.expectedWindow.timing).toBe("next_month");
    expect(profile?.baselineRegularNet).toBe(120000);
  });

  it("detects late_paycheck when expected window has elapsed by 3 days without credit", () => {
    const history: SalaryRecord[] = [
      makeRecord("r1", "2026-07", 100000, "2026-07-30"),
      makeRecord("r2", "2026-08", 100000, "2026-08-30"),
      makeRecord("r3", "2026-09", 100000, "2026-09-30"),
      // Missing October 2026!
    ];

    // Today is Nov 3, 2026 (3 days past Oct 31 window end)
    const signals = detectSalaryIrregularities(history, {
      todayKey: "2026-11-03",
      targetMonth: "2026-10",
    });

    expect(signals).toHaveLength(1);
    expect(signals[0].kind).toBe("late_paycheck");
    expect(signals[0].severity).toBe("attention");
    expect(signals[0].month).toBe("2026-10");
    expect(signals[0].description).toContain("No qualifying salary credit has appeared");
    expect(signals[0].description).toContain("does not confirm non-payment");
    expect(signals[0].expectedAmount).toBe(100000);
  });

  it("detects missing_paycheck when > 14 days elapsed past expected window", () => {
    const history: SalaryRecord[] = [
      makeRecord("r1", "2026-07", 100000, "2026-07-30"),
      makeRecord("r2", "2026-08", 100000, "2026-08-30"),
      makeRecord("r3", "2026-09", 100000, "2026-09-30"),
    ];

    // Today is Nov 18, 2026 (18 days past Oct 31 window end)
    const signals = detectSalaryIrregularities(history, {
      todayKey: "2026-11-18",
      targetMonth: "2026-10",
    });

    expect(signals).toHaveLength(1);
    expect(signals[0].kind).toBe("missing_paycheck");
    expect(signals[0].severity).toBe("warning");
    expect(signals[0].month).toBe("2026-10");
    expect(signals[0].title).toContain("Missing salary credit");
  });

  it("does NOT trigger signal before payday window ends", () => {
    const history: SalaryRecord[] = [
      makeRecord("r1", "2026-07", 100000, "2026-07-30"),
      makeRecord("r2", "2026-08", 100000, "2026-08-30"),
      makeRecord("r3", "2026-09", 100000, "2026-09-30"),
    ];

    // Today is Oct 25, 2026 (window starts ~Oct 28)
    const signals = detectSalaryIrregularities(history, {
      todayKey: "2026-10-25",
      targetMonth: "2026-10",
    });

    expect(signals).toHaveLength(0); // Not late yet!
  });

  it("detects partial_pay when regular salary is significantly below baseline (e.g. 50%)", () => {
    const history: SalaryRecord[] = [
      makeRecord("r1", "2026-07", 100000, "2026-07-30"),
      makeRecord("r2", "2026-08", 100000, "2026-08-30"),
      makeRecord("r3", "2026-09", 100000, "2026-09-30"),
      makeRecord("r4", "2026-10", 50000, "2026-10-30"), // 50% drop
    ];

    const signals = detectSalaryIrregularities(history, {
      todayKey: "2026-11-02",
      targetMonth: "2026-10",
    });

    expect(signals).toHaveLength(1);
    expect(signals[0].kind).toBe("partial_pay");
    expect(signals[0].severity).toBe("warning");
    expect(signals[0].actualAmount).toBe(50000);
    expect(signals[0].expectedAmount).toBe(100000);
    expect(signals[0].description).toContain("50%");
  });

  it("detects unexpected_decrease when regular salary drops by 20%", () => {
    const history: SalaryRecord[] = [
      makeRecord("r1", "2026-07", 100000, "2026-07-30"),
      makeRecord("r2", "2026-08", 100000, "2026-08-30"),
      makeRecord("r3", "2026-09", 100000, "2026-09-30"),
      makeRecord("r4", "2026-10", 80000, "2026-10-30"), // 20% drop
    ];

    const signals = detectSalaryIrregularities(history, {
      todayKey: "2026-11-02",
      targetMonth: "2026-10",
    });

    expect(signals).toHaveLength(1);
    expect(signals[0].kind).toBe("unexpected_decrease");
    expect(signals[0].severity).toBe("attention");
    expect(signals[0].actualAmount).toBe(80000);
  });

  it("detects unexpected_increase when regular salary jumps by 35% without bonus tag", () => {
    const history: SalaryRecord[] = [
      makeRecord("r1", "2026-07", 100000, "2026-07-30"),
      makeRecord("r2", "2026-08", 100000, "2026-08-30"),
      makeRecord("r3", "2026-09", 100000, "2026-09-30"),
      makeRecord("r4", "2026-10", 135000, "2026-10-30"), // 35% increase
    ];

    const signals = detectSalaryIrregularities(history, {
      todayKey: "2026-11-02",
      targetMonth: "2026-10",
    });

    expect(signals).toHaveLength(1);
    expect(signals[0].kind).toBe("unexpected_increase");
    expect(signals[0].severity).toBe("info");
    expect(signals[0].suggestedActions.some((a) => a.action === "reclassify")).toBe(true);
  });

  it("does NOT trigger false decrease alert after a high bonus month (variable pay isolation)", () => {
    const history: SalaryRecord[] = [
      makeRecord("r1", "2026-07", 100000, "2026-07-30"),
      makeRecord("r2", "2026-08", 100000, "2026-08-30"),
      makeRecord("r3", "2026-09", 100000, "2026-09-30"),
      makeRecord("b3", "2026-09", 200000, "2026-09-30", "bonus"), // ₹2L bonus in Sep
      makeRecord("r4", "2026-10", 100000, "2026-10-30"), // Normal regular salary in Oct
    ];

    const signals = detectSalaryIrregularities(history, {
      todayKey: "2026-11-02",
      targetMonth: "2026-10",
    });

    // Oct regular salary is 100k, matching baseline of 100k. Bonus was excluded!
    expect(signals).toHaveLength(0);
  });

  it("filters out dismissed signals using deterministic signal ID", () => {
    const history: SalaryRecord[] = [
      makeRecord("r1", "2026-07", 100000, "2026-07-30"),
      makeRecord("r2", "2026-08", 100000, "2026-08-30"),
      makeRecord("r3", "2026-09", 100000, "2026-09-30"),
    ];

    const signals = detectSalaryIrregularities(history, {
      todayKey: "2026-11-03",
      targetMonth: "2026-10",
    });
    expect(signals).toHaveLength(1);
    const signalId = signals[0].id;

    // User dismisses this signal
    const dismissals: SalarySignalDismissal[] = [
      {
        id: signalId,
        signalKind: "late_paycheck",
        month: "2026-10",
        employerName: "Acme Corp",
        reason: "changed_jobs",
        dismissedAtMs: 1729000000000,
      },
    ];

    const active = filterActiveSalarySignals(signals, dismissals);
    expect(active).toHaveLength(0);
  });

  it("builds a calm, measured notification without overstating certainty", () => {
    const signal: SalarySignal = {
      id: buildSignalId("Acme Corp", "2026-10", "late_paycheck"),
      kind: "late_paycheck",
      severity: "attention",
      title: "Expected salary not yet detected",
      description: "Sample description",
      month: "2026-10",
      employerName: "Acme Corp",
      expectedAmount: 100000,
      confidence: "high",
      supportingHistory: {
        sampleCount: 3,
        typicalDay: 30,
        baselineAmount: 100000,
        expectedWindow: { startDay: 28, endDay: 31, timing: "same_month" },
      },
      suggestedActions: [],
    };

    const notif = buildSalarySignalNotification(signal);
    expect(notif.title).toContain("Expected credit not detected");
    expect(notif.body).toContain("has not appeared in your accounts as of today");
    expect(notif.body).not.toContain("failed to pay");
    expect(notif.priority).toBe(2);
  });
});
