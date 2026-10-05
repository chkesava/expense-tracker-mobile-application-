/**
 * Puts the runway pieces together for the screen (SPENDLY-210): sources (207)
 * → baseline (208) → events + engine (206) → confidence (205). Pure, so the
 * whole pipeline is testable without React or Firebase.
 */

import type { CalendarEvent } from "../types/calendar";
import type { CreditCardBill } from "../types/creditCardBill";
import type { Expense, Income } from "../types/expense";
import type { RunwayAssumptionCode, RunwayConfidence } from "../types/runway";
import type { Subscription } from "../types/subscription";
import { buildRunwayBaseline, type RunwayBaselineResult } from "./runwayBaseline";
import { deriveConfidence } from "./runwayContract";
import { runRunwayEngine, type RunwayEngineOutput, type RunwayEvent } from "./runwayEngine";
import { calendarToRunwayEvents } from "./runwayEvents";
import { thresholdFromSettings, type RunwaySettings } from "./runwaySettings";
import type { RunwaySources } from "./runwaySources";

export interface RunwayModelInput {
  sources: RunwaySources;
  expenses: readonly Expense[];
  incomes: readonly Income[];
  subscriptions: readonly Subscription[];
  bills: readonly CreditCardBill[];
  calendarEvents: readonly CalendarEvent[];
  today: string;
  displayCurrency: string;
  settings: RunwaySettings;
}

export interface RunwayModel {
  baseline: RunwayBaselineResult;
  events: RunwayEvent[];
  output: RunwayEngineOutput;
  confidence: RunwayConfidence;
  assumptions: RunwayAssumptionCode[];
}

export function buildRunwayModel(input: RunwayModelInput): RunwayModel {
  const { settings } = input;
  const baseline = buildRunwayBaseline({
    expenses: input.expenses,
    incomes: input.incomes,
    subscriptions: input.subscriptions,
    today: input.today,
    windowMonths: settings.windowMonths,
    method: settings.method,
    includeUnusual: settings.includeUnusual,
  });
  const projection = settings.mode === "commitment_projection";
  const events = projection
    ? calendarToRunwayEvents(input.calendarEvents, input.today, input.displayCurrency)
    : [];
  const output = runRunwayEngine({
    today: input.today,
    mode: settings.mode,
    projectionMonths: settings.projectionMonths,
    threshold: thresholdFromSettings(settings),
    liquid: input.sources.liquidTotal,
    baseline: projection ? baseline.projectionBaseline : baseline.burnBaseline,
    events,
  });

  const hasUncertainCommitments =
    baseline.assumptions.includes("uncertain_commitments") ||
    (projection &&
      input.calendarEvents.some(
        (ce) =>
          ce.direction !== "neutral" &&
          ce.state !== "completed" &&
          ce.state !== "cancelled" &&
          (ce.amount === null || ce.amount <= 0)
      ));

  const resources = input.sources.resources;
  const { level, reasons } = deriveConfidence({
    monthsOfHistory: baseline.monthsOfHistory,
    includedResourceCount: input.sources.counted.length,
    unknownResourceCount: resources.filter((r) => r.liquidity === "unknown" && !r.included).length,
    unsupportedCurrencyCount: resources.filter((r) => r.reasons.includes("currency_unsupported")).length,
    uncertainCommitmentCount: hasUncertainCommitments ? 1 : 0,
    unresolvedCategoryCount: baseline.unresolvedCategoryCount,
  });
  
  const allAssumptions = new Set<RunwayAssumptionCode>([...reasons, ...baseline.assumptions]);
  if (hasUncertainCommitments) allAssumptions.add("uncertain_commitments");
  const assumptions = [...allAssumptions];
  
  return { baseline, events, output, confidence: level, assumptions };
}
