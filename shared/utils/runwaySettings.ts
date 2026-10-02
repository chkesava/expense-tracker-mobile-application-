/**
 * The user's runway preferences (SPENDLY-210), stored at
 * users/{uid}/runwaySettings/default. Pure helpers: defaults, normalisation
 * of whatever is stored, and conversion to the engine's threshold.
 */

import { RUNWAY_PROJECTION_LIMITS } from "../data/runwayRules";
import type { RunwayMode, RunwayThreshold } from "../types/runway";
import { BASELINE_WINDOWS, type BaselineMethod, type BaselineWindow } from "./runwayBaseline";

export const RUNWAY_SETTINGS_DOC_ID = "default";
export const RUNWAY_THRESHOLD_KINDS = ["none", "amount", "essential_months"] as const;
export type RunwayThresholdKind = (typeof RUNWAY_THRESHOLD_KINDS)[number];

/** Largest reserve amount accepted, matching the rules. */
export const RUNWAY_MAX_THRESHOLD_AMOUNT = 1_000_000_000_000;
export const RUNWAY_MAX_THRESHOLD_MONTHS = 24;

export interface RunwaySettings {
  mode: RunwayMode;
  thresholdKind: RunwayThresholdKind;
  thresholdAmount: number;
  thresholdMonths: number;
  windowMonths: BaselineWindow;
  method: BaselineMethod;
  includeUnusual: boolean;
  projectionMonths: number;
}

export const DEFAULT_RUNWAY_SETTINGS: RunwaySettings = {
  mode: "commitment_projection",
  thresholdKind: "none",
  thresholdAmount: 0,
  thresholdMonths: 1,
  windowMonths: 6,
  method: "average",
  includeUnusual: false,
  projectionMonths: RUNWAY_PROJECTION_LIMITS.defaultMonths,
};

const MODES: readonly RunwayMode[] = ["net_burn", "gross_burn", "commitment_projection"];

function finiteIn(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : fallback;
}

/** Any stored shape → a valid settings object. Unknown or bad values fall back to defaults. */
export function normalizeRunwaySettings(raw: unknown): RunwaySettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_RUNWAY_SETTINGS;
  return {
    mode: MODES.includes(r.mode as RunwayMode) ? (r.mode as RunwayMode) : d.mode,
    thresholdKind: RUNWAY_THRESHOLD_KINDS.includes(r.thresholdKind as RunwayThresholdKind) ? (r.thresholdKind as RunwayThresholdKind) : d.thresholdKind,
    thresholdAmount: finiteIn(r.thresholdAmount, 0, RUNWAY_MAX_THRESHOLD_AMOUNT, d.thresholdAmount),
    thresholdMonths: finiteIn(r.thresholdMonths, 0, RUNWAY_MAX_THRESHOLD_MONTHS, d.thresholdMonths),
    windowMonths: BASELINE_WINDOWS.includes(r.windowMonths as BaselineWindow) ? (r.windowMonths as BaselineWindow) : d.windowMonths,
    method: r.method === "median" || r.method === "average" ? r.method : d.method,
    includeUnusual: typeof r.includeUnusual === "boolean" ? r.includeUnusual : d.includeUnusual,
    projectionMonths: Number.isInteger(r.projectionMonths)
      ? finiteIn(r.projectionMonths, RUNWAY_PROJECTION_LIMITS.minMonths, RUNWAY_PROJECTION_LIMITS.maxMonths, d.projectionMonths)
      : d.projectionMonths,
  };
}

export function thresholdFromSettings(s: RunwaySettings): RunwayThreshold {
  switch (s.thresholdKind) {
    case "amount":
      return { kind: "amount", amount: s.thresholdAmount };
    case "essential_months":
      return { kind: "essential_months", months: s.thresholdMonths };
    default:
      return { kind: "none" };
  }
}

/** The exact document written to Firestore (field order irrelevant). */
export function runwaySettingsDoc(s: RunwaySettings, nowMs: number): RunwaySettings & { updatedAtMs: number } {
  return { ...normalizeRunwaySettings(s), updatedAtMs: nowMs };
}
