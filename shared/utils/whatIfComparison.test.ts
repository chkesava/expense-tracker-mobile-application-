import { describe, expect, it } from "vitest";
import { compareWhatIfProjection } from "./whatIfComparison";
import type { WhatIfProjectionOutput } from "./whatIfEngine";

const period = (month: string, opening: number, inflow: number, outflow: number) => ({ month, startDate: `${month}-01`, endDate: `${month}-28`, opening, inflow, outflow, net: inflow - outflow, closing: opening + inflow - outflow, belowFloor: false });
const output = (): WhatIfProjectionOutput => {
  const baselinePeriods = [period("2026-10", 10_000, 5_000, 4_000), period("2026-11", 11_000, 5_000, 4_000)];
  const scenarioPeriods = [period("2026-10", 10_000, 5_000, 5_000), period("2026-11", 10_000, 5_000, 5_000)];
  const engine = (periods: typeof baselinePeriods, drivers: WhatIfProjectionOutput["baseline"]["drivers"]) => ({ result: { mode: "commitment_projection" as const, state: "beyond_horizon" as const, months: null, floor: 0, monthlyBurn: 4_000 }, thresholdDate: null, liquid: 10_000, essentialMonthly: 4_000, expectedInflow: 10_000, expectedOutflow: periods.reduce((sum, p) => sum + p.outflow, 0), minimumBalance: { amount: Math.min(...periods.map((p) => p.closing)), date: "2026-11-28" }, periods, drivers, horizonEnd: "2026-11-28", issues: [] });
  return { baseline: engine(baselinePeriods, [{ id: "event:rent", label: "Rent", direction: "out", amount: 8_000, share: 1, source: "subscription" }]), scenario: engine(scenarioPeriods, [{ id: "what-if:rent", label: "Rent", direction: "out", amount: 10_000, share: 1, source: "what_if" }]), periods: [{ month: "2026-10", baselineClosing: 11_000, scenarioClosing: 10_000, closingDelta: -1_000, baselineNet: 1_000, scenarioNet: 0, netDelta: -1_000, inflowDelta: 0, outflowDelta: 1_000 }, { month: "2026-11", baselineClosing: 12_000, scenarioClosing: 10_000, closingDelta: -2_000, baselineNet: 1_000, scenarioNet: 0, netDelta: -1_000, inflowDelta: 0, outflowDelta: 1_000 }], appliedAdjustments: [], issues: [] };
};

describe("what-if comparison", () => {
  it("reconciles metric deltas and percentages", () => {
    const result = compareWhatIfProjection({ output: output() });
    const closing = result.metrics.find((metric) => metric.key === "closing_balance");
    expect(closing).toMatchObject({ baseline: 12_000, scenario: 10_000, delta: -2_000, percentDelta: -16.67 });
    expect(result.insufficientData).toBe(false);
  });

  it("exposes material driver changes by stable id", () => {
    const result = compareWhatIfProjection({ output: output() });
    expect(result.drivers[0]).toMatchObject({ label: "Rent", baseline: 0, scenario: 10_000, delta: 10_000 });
  });

  it("labels historical and projected periods and identifies recurring events", () => {
    const result = compareWhatIfProjection({
      output: output(),
      historical: [{ month: "2026-09", startDate: "2026-09-01", endDate: "2026-09-30", opening: 9_000, inflow: 5_000, outflow: 4_000, net: 1_000, closing: 10_000 }],
      scenarioEvents: [{ id: "rent", label: "Rent", source: "what_if", direction: "out", amount: 1_000, certainty: "assumed", schedule: { kind: "monthly", firstDate: "2026-10-10", dayOfMonth: 10 } }],
    });
    expect(result.timeline.map((point) => point.phase)).toEqual(["historical", "projected", "projected"]);
    expect(result.timeline[1].events[0]).toMatchObject({ date: "2026-10-10", label: "Rent" });
  });

  it("handles zero baselines and insufficient data without inventing percentages", () => {
    const broken = output();
    broken.baseline.result = { ...broken.baseline.result, state: "insufficient_data", months: null, monthlyBurn: null };
    broken.baseline.issues = ["missing baseline"];
    const result = compareWhatIfProjection({ output: broken });
    expect(result.metrics.find((metric) => metric.key === "runway_months")?.percentDelta).toBeNull();
    expect(result.insufficientData).toBe(true);
    expect(result.issues).toContain("missing baseline");
  });
});
