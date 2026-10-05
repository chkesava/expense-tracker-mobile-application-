/**
 * What-If screen view model (SPENDLY-387). Pure: runs the projection with the
 * SPENDLY-197 engine and the SPENDLY-201 comparison, then shapes plain-language
 * text for the screens. No second financial model lives here.
 *
 * The engine projects from today only (it requires `today` to equal the
 * scenario's as-of date), so a saved scenario is always recalculated against
 * today's reference. Its saved as-of date stays visible as provenance, and
 * "Update to today" records the move as a versioned rebase.
 */

import type { RunwayThreshold } from "../types/runway";
import type { WhatIfBaselineSnapshot, WhatIfScenarioDefinition } from "../types/whatIf";
import { compareWhatIfProjection, type WhatIfComparisonMetric, type WhatIfComparisonOutput } from "./whatIfComparison";
import { runWhatIfProjection, type WhatIfProjectionOutput } from "./whatIfEngine";
import { monthLabel } from "./runwayView";

export interface WhatIfRun {
  output: WhatIfProjectionOutput;
  comparison: WhatIfComparisonOutput;
}

/** Project a scenario (saved or draft) against today's baseline. */
export function runWhatIf(input: {
  scenario: Omit<WhatIfScenarioDefinition, "id"> & { id?: string };
  baseline: WhatIfBaselineSnapshot;
  threshold: RunwayThreshold;
}): WhatIfRun {
  const scenario: WhatIfScenarioDefinition = { ...input.scenario, id: input.scenario.id || "draft", reference: input.baseline.reference };
  const output = runWhatIfProjection({
    today: input.baseline.reference.asOfDate,
    mode: "commitment_projection",
    threshold: input.threshold,
    scenario,
    baseline: input.baseline,
  });
  return { output, comparison: compareWhatIfProjection({ output }) };
}

export type WhatIfTone = "better" | "worse" | "same" | "unknown";

const toneOf = (delta: number | null, higherIsBetter = true): WhatIfTone => {
  if (delta === null) return "unknown";
  if (Math.abs(delta) < 0.005) return "same";
  return (delta > 0) === higherIsBetter ? "better" : "worse";
};

function metricOf(comparison: WhatIfComparisonOutput, key: string): WhatIfComparisonMetric | undefined {
  return comparison.metrics.find((m) => m.key === key);
}

export interface WhatIfHeadline {
  tone: WhatIfTone;
  title: string;
  detail: string;
}

function months(value: number | null): string {
  if (value === null) return "more than the projection";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} ${rounded === 1 ? "month" : "months"}`;
}

/** The one-line answer at the top of the results. */
export function whatIfHeadline(comparison: WhatIfComparisonOutput, fmt: (n: number) => string): WhatIfHeadline {
  const closing = metricOf(comparison, "closing_balance");
  if (comparison.insufficientData || !closing || closing.delta === null || closing.baseline === null || closing.scenario === null) {
    return {
      tone: "unknown",
      title: "Not enough data yet",
      detail: "Add accounts and a few months of transactions so What If has a starting point.",
    };
  }
  const end = comparison.comparisonEnd ? monthLabel(comparison.comparisonEnd.slice(0, 7)) : "the end";
  const tone = toneOf(closing.delta);
  const title = tone === "same" ? `No change by ${end}` : `${closing.delta > 0 ? "+" : "−"}${fmt(Math.abs(closing.delta))} by ${end}`;
  const detail = `By the end of ${end} your balance would be ${fmt(closing.scenario)} instead of ${fmt(closing.baseline)} on your current path.`;
  return { tone, title, detail };
}

export interface WhatIfMetricRow {
  key: string;
  label: string;
  baseline: string;
  scenario: string;
  delta: string;
  tone: WhatIfTone;
  /** Full sentence for screen readers. */
  accessibilityLabel: string;
}

/** Comparison metrics as display rows. Burn and outflow are better when lower. */
export function whatIfMetricRows(comparison: WhatIfComparisonOutput, fmt: (n: number) => string): WhatIfMetricRow[] {
  return comparison.metrics.map((m) => {
    const isMonths = m.unit === "months";
    const show = (v: number | null) => (v === null ? "—" : isMonths ? months(v) : fmt(v));
    const higherIsBetter = !["expected_outflow", "monthly_burn"].includes(m.key);
    const tone = toneOf(m.delta, higherIsBetter);
    const delta = m.delta === null ? "—" : tone === "same" ? "No change" : `${m.delta > 0 ? "+" : "−"}${isMonths ? months(Math.abs(m.delta)) : fmt(Math.abs(m.delta))}`;
    return {
      key: m.key,
      label: m.label,
      baseline: show(m.baseline),
      scenario: show(m.scenario),
      delta,
      tone,
      accessibilityLabel: `${m.label}: now ${show(m.baseline)}, with this scenario ${show(m.scenario)}. ${delta === "—" ? "Not available" : delta}.`,
    };
  });
}

export interface WhatIfTimelineRow {
  month: string;
  label: string;
  baseline: number;
  scenario: number;
  delta: number;
  tone: WhatIfTone;
  accessibilityLabel: string;
}

/** Projected months only, for the month-by-month view. */
export function whatIfTimelineRows(comparison: WhatIfComparisonOutput, fmt: (n: number) => string): WhatIfTimelineRow[] {
  return comparison.timeline
    .filter((p) => p.phase === "projected" && p.baseline && p.scenario)
    .map((p) => {
      const baseline = p.baseline!.closing;
      const scenario = p.scenario!.closing;
      const delta = Math.round((scenario - baseline) * 100) / 100;
      const label = monthLabel(p.month);
      return {
        month: p.month,
        label,
        baseline,
        scenario,
        delta,
        tone: toneOf(delta),
        accessibilityLabel: `${label}: current path ${fmt(baseline)}, scenario ${fmt(scenario)}, difference ${delta >= 0 ? "plus" : "minus"} ${fmt(Math.abs(delta))}.`,
      };
    });
}

/** Always-shown limits of the model. */
export const WHAT_IF_DISCLOSURES = [
  "A planning estimate, not a forecast or advice.",
  "Starts from your counted accounts, your recent spending baseline and your scheduled subscriptions, EMIs and card bills.",
  "Taxes, fees you did not enter, market changes and investment returns are not modelled.",
  "Nothing here changes your real transactions, accounts, goals or investments.",
];
