/**
 * View model for the runway screen (SPENDLY-210). Pure: turns engine and
 * baseline output into labelled, accessible text so meaning never depends on
 * colour alone. Tested in runwayView.test.ts.
 */

import { RUNWAY_ASSUMPTIONS, RUNWAY_MODE_INFO } from "../data/runwayRules";
import type { RunwayAssumptionCode, RunwayConfidence, RunwayMode } from "../types/runway";
import type { RunwayBaselineResult } from "./runwayBaseline";
import type { RunwayEngineOutput } from "./runwayEngine";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(2, 4)}`;
}

export function dateLabel(date: string): string {
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

export function formatRunwayMonths(months: number): string {
  if (months < 1) return "Under a month";
  const whole = Math.floor(months);
  const rest = months - whole;
  const approx = rest >= 0.75 ? `${whole + 1}` : rest >= 0.25 ? `${whole}½` : `${whole}`;
  return `About ${approx} month${approx === "1" ? "" : "s"}`;
}

export interface RunwayHeadline {
  /** Big figure, e.g. "About 5½ months". */
  title: string;
  /** One line under it. */
  detail: string;
  /** Short label always shown next to the figure. */
  badge: "Estimate" | "Below reserve" | "Not enough data";
  tone: "neutral" | "warning" | "muted";
}

export function runwayHeadline(out: RunwayEngineOutput, projectionMonths: number, reserveText: string): RunwayHeadline {
  const r = out.result;
  const when = out.thresholdDate ? dateLabel(out.thresholdDate) : "—";
  switch (r.state) {
    case "finite":
      return {
        title: formatRunwayMonths(r.months ?? 0),
        detail: reserveText ? `Your ${reserveText} reserve is reached around ${when}` : `Counted money runs out around ${when}`,
        badge: "Estimate",
        tone: "neutral",
      };
    case "beyond_horizon":
      return { title: `More than ${projectionMonths} months`, detail: `Your balance falls but stays above the reserve for the next ${projectionMonths} months`, badge: "Estimate", tone: "neutral" };
    case "not_depleting":
      return { title: "Not running down", detail: "Expected money in covers expected money out", badge: "Estimate", tone: "neutral" };
    case "already_below":
      return { title: "Below your reserve now", detail: "Counted money is already at or under the reserve you set", badge: "Below reserve", tone: "warning" };
    default:
      return {
        title: "Not enough data yet",
        detail: "Runway needs at least one full month of recorded spending",
        badge: "Not enough data",
        tone: "muted",
      };
  }
}

export interface TimelineRow {
  key: string;
  month: string;
  label: string;
  kind: "actual" | "projected";
  /** Money in − money out for the month. */
  net: number;
  /** Projected closing balance; null for actual months (no balance history). */
  closing: number | null;
  belowFloor: boolean;
  /** Full sentence for screen readers. */
  accessibilityLabel: string;
}

export function timelineRows(
  baseline: RunwayBaselineResult,
  out: RunwayEngineOutput,
  format: (amount: number) => string
): TimelineRow[] {
  const rows: TimelineRow[] = [];
  for (const m of baseline.months) {
    if (m.status !== "included") continue;
    const outflow = Object.entries(m.outflowByClass).reduce((t, [c, v]) => (c === "money_movement" ? t : t + v), 0);
    const net = Math.round((m.earnedIncome - outflow + m.refunds) * 100) / 100;
    rows.push({
      key: `a:${m.month}`,
      month: m.month,
      label: monthLabel(m.month),
      kind: "actual",
      net,
      closing: null,
      belowFloor: false,
      accessibilityLabel: `${monthLabel(m.month)}, actual: ${net >= 0 ? "surplus" : "deficit"} of ${format(Math.abs(net))}`,
    });
  }
  for (const p of out.periods) {
    rows.push({
      key: `p:${p.month}`,
      month: p.month,
      label: monthLabel(p.month),
      kind: "projected",
      net: p.net,
      closing: p.closing,
      belowFloor: p.belowFloor,
      accessibilityLabel: `${monthLabel(p.month)}, projected: ${p.net >= 0 ? "surplus" : "deficit"} of ${format(Math.abs(p.net))}, ending balance ${format(p.closing)}${p.belowFloor ? ", below your reserve" : ""}`,
    });
  }
  return rows;
}

export const CONFIDENCE_LABELS: Record<RunwayConfidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  insufficient: "Not enough data",
};

/** The "How this is worked out" lines. */
export function methodologyLines(mode: RunwayMode, baseline: RunwayBaselineResult, assumptions: readonly RunwayAssumptionCode[]): string[] {
  const w = baseline.window;
  const lines = [
    `Mode: ${RUNWAY_MODE_INFO[mode].label}. ${RUNWAY_MODE_INFO[mode].formula}.`,
    `Typical spending and income: ${w.method === "median" ? "median" : "average"} of ${baseline.monthsOfHistory} complete month${baseline.monthsOfHistory === 1 ? "" : "s"} between ${monthLabel(w.from)} and ${monthLabel(w.to)}. This month is left out because it isn't finished.`,
  ];
  const skipped = baseline.months.filter((m) => m.status !== "included").length;
  if (skipped) lines.push(`${skipped} month${skipped === 1 ? "" : "s"} in that window had no records and ${skipped === 1 ? "was" : "were"} left out.`);
  if (baseline.unusual.length) lines.push(`${baseline.unusual.length} unusually large one-off expense${baseline.unusual.length === 1 ? " is" : "s are"} listed below and handled as you chose.`);
  if (mode === "commitment_projection") lines.push("Scheduled recurring items and unpaid card bills are added on their dates; their past payments are taken out of typical spending so nothing is counted twice.");
  for (const code of assumptions) lines.push(RUNWAY_ASSUMPTIONS[code].text);
  lines.push("This is a planning estimate, not a prediction. It never changes your records.");
  return lines;
}
