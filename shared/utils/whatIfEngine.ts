import type { RunwayEngineOutput, RunwayEvent, RunwayPeriod } from "./runwayEngine";
import { runRunwayEngine } from "./runwayEngine";
import type { RunwayMode, RunwayThreshold } from "../types/runway";
import {
  validateWhatIfBaselineSnapshot,
  validateWhatIfScenario,
  type WhatIfAdjustment,
  type WhatIfBaselineSnapshot,
  type WhatIfScenarioDefinition,
} from "../types/whatIf";

export interface WhatIfProjectionInput {
  today: string;
  mode: RunwayMode;
  threshold: RunwayThreshold;
  scenario: WhatIfScenarioDefinition;
  baseline: WhatIfBaselineSnapshot;
}

export interface WhatIfPeriodDelta {
  month: string;
  baselineClosing: number;
  scenarioClosing: number;
  closingDelta: number;
  baselineNet: number;
  scenarioNet: number;
  netDelta: number;
  inflowDelta: number;
  outflowDelta: number;
}

export interface WhatIfAppliedAdjustment {
  id: string;
  operation: WhatIfAdjustment["operation"];
  matchedEvents: number;
}

export interface WhatIfProjectionOutput {
  baseline: RunwayEngineOutput;
  scenario: RunwayEngineOutput;
  periods: WhatIfPeriodDelta[];
  appliedAdjustments: WhatIfAppliedAdjustment[];
  issues: string[];
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;

function matchesSource(event: RunwayEvent, adjustment: WhatIfAdjustment): boolean {
  const sourceRef = adjustment.sourceRef;
  if (!sourceRef) return false;
  return event.id === sourceRef.refId
    || event.id === `${sourceRef.source}:${sourceRef.refId}`
    || event.id.startsWith(`${sourceRef.source}:${sourceRef.refId}:`);
}

function hypotheticalEvent(adjustment: WhatIfAdjustment, id = `what-if:${adjustment.id}`): RunwayEvent {
  return {
    id,
    label: adjustment.label,
    source: "what_if",
    direction: adjustment.direction,
    amount: adjustment.amount,
    burnClass: adjustment.burnClass,
    certainty: "assumed",
    schedule: adjustment.schedule,
  };
}

/**
 * Applies hypothetical adjustments to derived events without mutating the
 * canonical baseline. Remove/replace operations require a source reference so
 * a scenario cannot accidentally remove an unrelated event.
 */
export function applyWhatIfAdjustments(
  baselineEvents: readonly RunwayEvent[],
  adjustments: readonly WhatIfAdjustment[]
): { events: RunwayEvent[]; applied: WhatIfAppliedAdjustment[]; issues: string[] } {
  let events = [...baselineEvents];
  const applied: WhatIfAppliedAdjustment[] = [];
  const issues: string[] = [];

  for (const adjustment of adjustments) {
    if (adjustment.operation === "add") {
      events.push(hypotheticalEvent(adjustment));
      applied.push({ id: adjustment.id, operation: adjustment.operation, matchedEvents: 0 });
      continue;
    }

    if (!adjustment.sourceRef) {
      issues.push(`${adjustment.id}: ${adjustment.operation} requires sourceRef`);
      applied.push({ id: adjustment.id, operation: adjustment.operation, matchedEvents: 0 });
      continue;
    }

    const matches = events.filter((event) => matchesSource(event, adjustment));
    if (matches.length === 0) {
      issues.push(`${adjustment.id}: sourceRef did not match a baseline event`);
      applied.push({ id: adjustment.id, operation: adjustment.operation, matchedEvents: 0 });
      continue;
    }

    if (adjustment.operation === "remove") events = events.filter((event) => !matchesSource(event, adjustment));
    else events = events.flatMap((event) => matchesSource(event, adjustment) ? [hypotheticalEvent(adjustment, `what-if:${adjustment.id}:${event.id}`)] : [event]);
    applied.push({ id: adjustment.id, operation: adjustment.operation, matchedEvents: matches.length });
  }

  return { events, applied, issues };
}

function withIssues(output: RunwayEngineOutput, issues: readonly string[]): RunwayEngineOutput {
  const merged = [...new Set([...output.issues, ...issues])];
  if (merged.length === 0) return output;
  return {
    ...output,
    issues: merged,
    result: { ...output.result, state: "insufficient_data", months: null },
  };
}

function periodDeltas(baseline: readonly RunwayPeriod[], scenario: readonly RunwayPeriod[]): WhatIfPeriodDelta[] {
  const scenarioByMonth = new Map(scenario.map((period) => [period.month, period]));
  return baseline.flatMap((base) => {
    const next = scenarioByMonth.get(base.month);
    if (!next) return [];
    return [{
      month: base.month,
      baselineClosing: base.closing,
      scenarioClosing: next.closing,
      closingDelta: roundMoney(next.closing - base.closing),
      baselineNet: base.net,
      scenarioNet: next.net,
      netDelta: roundMoney(next.net - base.net),
      inflowDelta: roundMoney(next.inflow - base.inflow),
      outflowDelta: roundMoney(next.outflow - base.outflow),
    }];
  });
}

export function runWhatIfProjection(input: WhatIfProjectionInput): WhatIfProjectionOutput {
  const contractIssues = [
    ...validateWhatIfScenario(input.scenario),
    ...validateWhatIfBaselineSnapshot(input.baseline),
  ];
  if (input.today !== input.scenario.reference.asOfDate) contractIssues.push("today must match scenario.reference.asOfDate");
  if (input.today !== input.baseline.reference.asOfDate) contractIssues.push("today must match baseline.reference.asOfDate");
  if (input.scenario.reference.asOfDate !== input.baseline.reference.asOfDate) contractIssues.push("scenario and baseline reference dates must match");
  if (input.baseline.liquid === null) contractIssues.push("baseline.liquid is unknown");

  const applied = applyWhatIfAdjustments(input.baseline.events, input.scenario.adjustments);
  const engineInput = {
    today: input.today,
    mode: input.mode,
    projectionMonths: input.scenario.durationMonths,
    threshold: input.threshold,
    liquid: input.baseline.liquid ?? 0,
    baseline: input.baseline.baseline,
  } as const;
  const baseline = withIssues(runRunwayEngine({ ...engineInput, events: input.baseline.events }), contractIssues);
  const scenario = withIssues(runRunwayEngine({ ...engineInput, events: applied.events }), [...contractIssues, ...applied.issues]);

  return {
    baseline,
    scenario,
    periods: periodDeltas(baseline.periods, scenario.periods),
    appliedAdjustments: applied.applied,
    issues: [...new Set([...baseline.issues, ...scenario.issues])],
  };
}
