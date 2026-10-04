/**
 * Baseline/scenario comparison and projection timeline (SPENDLY-201).
 *
 * Presentation-neutral data only: callers can render these rows as cards,
 * tables or charts without reimplementing financial comparison rules.
 */

import type { RunwayDriver, RunwayEvent, RunwayPeriod } from "./runwayEngine";
import type { WhatIfProjectionOutput, WhatIfPeriodDelta } from "./whatIfEngine";
import { occurrencesBetween } from "./runwayEngine";
import { roundMoney } from "./money";

export type WhatIfMetricUnit = "money" | "months";
export type WhatIfTimelinePhase = "historical" | "projected";

export interface WhatIfComparisonMetric {
  key: string;
  label: string;
  unit: WhatIfMetricUnit;
  baseline: number | null;
  scenario: number | null;
  delta: number | null;
  /** Null when the baseline is zero/unknown or the metric is unavailable. */
  percentDelta: number | null;
}

export interface WhatIfDriverDelta {
  id: string;
  label: string;
  direction: "in" | "out";
  source: string;
  baseline: number;
  scenario: number;
  delta: number;
}

export interface WhatIfHistoricalPeriod {
  month: string;
  startDate: string;
  endDate: string;
  opening: number;
  inflow: number;
  outflow: number;
  net: number;
  closing: number;
}

export interface WhatIfTimelineEvent {
  id: string;
  label: string;
  date: string;
  direction: "in" | "out";
  amount: number;
  source: string;
}

export interface WhatIfTimelinePoint {
  month: string;
  startDate: string;
  endDate: string;
  phase: WhatIfTimelinePhase;
  baseline: Pick<RunwayPeriod, "opening" | "inflow" | "outflow" | "net" | "closing"> | null;
  scenario: Pick<RunwayPeriod, "opening" | "inflow" | "outflow" | "net" | "closing"> | null;
  delta: WhatIfPeriodDelta | null;
  events: WhatIfTimelineEvent[];
}

export interface WhatIfComparisonOutput {
  comparisonStart: string | null;
  comparisonEnd: string | null;
  metrics: WhatIfComparisonMetric[];
  drivers: WhatIfDriverDelta[];
  timeline: WhatIfTimelinePoint[];
  issues: string[];
  /** True when the output cannot support a meaningful comparison. */
  insufficientData: boolean;
}

const money = (value: number | null): number | null => value === null ? null : roundMoney(value);
const last = (periods: readonly RunwayPeriod[]) => periods.length ? periods[periods.length - 1] : null;
const minBalance = (periods: readonly RunwayPeriod[]) => periods.length ? Math.min(...periods.map((period) => period.closing)) : null;

function percentDelta(baseline: number | null, delta: number | null): number | null {
  if (baseline === null || delta === null || baseline === 0) return null;
  return Math.round((delta / Math.abs(baseline)) * 10000) / 100;
}

function metric(key: string, label: string, unit: WhatIfMetricUnit, baseline: number | null, scenario: number | null): WhatIfComparisonMetric {
  const delta = baseline === null || scenario === null ? null : (unit === "money" ? money(scenario - baseline) : Math.round((scenario - baseline) * 10) / 10);
  return { key, label, unit, baseline: money(baseline), scenario: money(scenario), delta, percentDelta: percentDelta(baseline, delta) };
}

function drivers(baseline: readonly RunwayDriver[], scenario: readonly RunwayDriver[]): WhatIfDriverDelta[] {
  const all = new Map<string, { baseline?: RunwayDriver; scenario?: RunwayDriver }>();
  baseline.forEach((driver) => all.set(driver.id, { ...all.get(driver.id), baseline: driver }));
  scenario.forEach((driver) => all.set(driver.id, { ...all.get(driver.id), scenario: driver }));
  return [...all.entries()]
    .map(([id, pair]) => {
      const source = pair.scenario ?? pair.baseline!;
      const base = pair.baseline?.amount ?? 0;
      const next = pair.scenario?.amount ?? 0;
      return { id, label: source.label, direction: source.direction, source: source.source, baseline: roundMoney(base), scenario: roundMoney(next), delta: roundMoney(next - base) };
    })
    .filter((driver) => driver.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.id.localeCompare(b.id))
    .slice(0, 8);
}

function periodValue(period: RunwayPeriod): Pick<RunwayPeriod, "opening" | "inflow" | "outflow" | "net" | "closing"> {
  return { opening: period.opening, inflow: period.inflow, outflow: period.outflow, net: period.net, closing: period.closing };
}

function eventRows(events: readonly RunwayEvent[], period: Pick<RunwayPeriod, "startDate" | "endDate">): WhatIfTimelineEvent[] {
  return events.flatMap((event) => occurrencesBetween(event.schedule, period.startDate, period.endDate).map((date) => ({ id: event.id, label: event.label, date, direction: event.direction, amount: roundMoney(event.amount), source: event.source })));
}

function timeline(output: WhatIfProjectionOutput, events: readonly RunwayEvent[], history: readonly WhatIfHistoricalPeriod[]): WhatIfTimelinePoint[] {
  const historical = history.map((period) => ({
    month: period.month,
    startDate: period.startDate,
    endDate: period.endDate,
    phase: "historical" as const,
    baseline: periodValue(period as RunwayPeriod),
    scenario: null,
    delta: null,
    events: [],
  }));
  const projected = output.baseline.periods.flatMap((base) => {
    const scenario = output.scenario.periods.find((period) => period.month === base.month);
    const delta = output.periods.find((period) => period.month === base.month) ?? null;
    if (!scenario) return [];
    return [{ month: base.month, startDate: base.startDate, endDate: base.endDate, phase: "projected" as const, baseline: periodValue(base), scenario: periodValue(scenario), delta, events: eventRows(events, base) }];
  });
  return [...historical, ...projected].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.phase.localeCompare(b.phase));
}

/** Build a reconciled, render-ready comparison from one What-If projection. */
export function compareWhatIfProjection(input: { output: WhatIfProjectionOutput; scenarioEvents?: readonly RunwayEvent[]; historical?: readonly WhatIfHistoricalPeriod[] }): WhatIfComparisonOutput {
  const { output } = input;
  const issues = [...new Set([...output.issues, ...output.baseline.issues, ...output.scenario.issues])];
  if (output.baseline.horizonEnd !== output.scenario.horizonEnd) issues.push("baseline and scenario horizons must match");
  if (output.periods.length === 0 && output.baseline.periods.length > 0) issues.push("baseline and scenario have no common comparison periods");
  const baseLast = last(output.baseline.periods);
  const scenarioLast = last(output.scenario.periods);
  const metrics = [
    metric("closing_balance", "Balance at projection end", "money", baseLast?.closing ?? null, scenarioLast?.closing ?? null),
    metric("minimum_balance", "Lowest projected balance", "money", minBalance(output.baseline.periods), minBalance(output.scenario.periods)),
    metric("expected_inflow", "Expected inflow", "money", output.baseline.expectedInflow, output.scenario.expectedInflow),
    metric("expected_outflow", "Expected outflow", "money", output.baseline.expectedOutflow, output.scenario.expectedOutflow),
    metric("runway_months", "Runway", "months", output.baseline.result.months, output.scenario.result.months),
    metric("monthly_burn", "Monthly burn", "money", output.baseline.result.monthlyBurn, output.scenario.result.monthlyBurn),
  ];
  const points = timeline(output, input.scenarioEvents ?? [], input.historical ?? []);
  return {
    comparisonStart: points[0]?.startDate ?? null,
    comparisonEnd: points[points.length - 1]?.endDate ?? null,
    metrics,
    drivers: drivers(output.baseline.drivers, output.scenario.drivers),
    timeline: points,
    issues,
    insufficientData: issues.length > 0 || output.baseline.result.state === "insufficient_data" || output.scenario.result.state === "insufficient_data",
  };
}
