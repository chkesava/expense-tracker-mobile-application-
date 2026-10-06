/**
 * Financial Calendar and What-If inputs for goal funding (SPENDLY-219).
 *
 * Calendar part (built): the planning window, and an end-to-end builder that
 * turns canonical records into the funding capacity — runway projection
 * baseline + calendar commitments for the window (215 rules: open items only,
 * cancelled/completed excluded, unknown amounts listed, money owed to the user
 * not counted).
 *
 * What-If part (on hold for SPENDLY-195): `CapacityAdjustment` is the hook
 * point. What-If scenarios will arrive as hypothetical monthly adjustments
 * (salary change, new commitment, …) applied on top of the real capacity —
 * never written anywhere, and always labelled hypothetical. Until SPENDLY-195
 * exists, only adjustments the user types in the plan use it.
 */

import type { CalendarEvent, CalendarRange } from "../types/calendar";
import { shiftDateKey, shiftMonthKey } from "./dates";
import { buildFundingCapacity, type FundingCapacity } from "./goalFundingCapacity";
import { roundMoney } from "./money";
import type { RunwayBaseline } from "./runwayEngine";

export const DEFAULT_PLANNING_WINDOW_MONTHS = 3;

/** Today through the day before the same date `months` months later. */
export function planningWindow(today: string, months = DEFAULT_PLANNING_WINDOW_MONTHS): CalendarRange {
  const end = `${shiftMonthKey(today.slice(0, 7), months)}-${today.slice(8)}`;
  // Clamp an end like 31 Feb by stepping back from the first of the next month.
  const [y, m] = end.split("-").map(Number);
  const dim = new Date(y, m, 0).getDate();
  const safeEnd = `${end.slice(0, 7)}-${String(Math.min(Number(end.slice(8)), dim)).padStart(2, "0")}`;
  return { from: today, to: shiftDateKey(safeEnd, -1) };
}

/** A hypothetical monthly change to capacity (What-If, SPENDLY-195; or typed by the user). */
export interface CapacityAdjustment {
  id: string;
  label: string;
  /** + adds capacity (e.g. a raise), − removes it (e.g. a new EMI). */
  monthlyDelta: number;
  source: "what_if" | "user";
}

export interface AdjustedCapacity extends FundingCapacity {
  /** Real capacity before any hypothetical adjustment. */
  baseMonthly: number | null;
  adjustments: CapacityAdjustment[];
  /** True when any adjustment is applied — the figure is then a what-if. */
  hypothetical: boolean;
}

/** Apply hypothetical adjustments on top of real capacity. Never changes the input. */
export function applyCapacityAdjustments(capacity: FundingCapacity, adjustments: readonly CapacityAdjustment[]): AdjustedCapacity {
  const valid = adjustments.filter((a) => Number.isFinite(a.monthlyDelta) && a.monthlyDelta !== 0);
  if (!valid.length || capacity.monthly === null) {
    return { ...capacity, baseMonthly: capacity.monthly, adjustments: [], hypothetical: false };
  }
  const delta = valid.reduce((t, a) => t + a.monthlyDelta, 0);
  const monthly = roundMoney(capacity.monthly + delta);
  return {
    ...capacity,
    monthly,
    status: monthly > 0 ? "positive" : monthly === 0 ? "zero" : "negative",
    baseMonthly: capacity.monthly,
    adjustments: valid,
    hypothetical: true,
  };
}

/**
 * Capacity for goal planning from canonical inputs: the runway projection
 * baseline (208) and calendar events for the planning window (178).
 */
export function goalFundingCapacityFromSources(input: {
  baseline: RunwayBaseline | null;
  calendarEvents: readonly CalendarEvent[];
  window: CalendarRange;
  plannedMonthly?: number | null;
  adjustments?: readonly CapacityAdjustment[];
}): AdjustedCapacity {
  const inWindow = input.calendarEvents.filter((e) => e.date >= input.window.from && e.date <= input.window.to);
  const capacity = buildFundingCapacity({ baseline: input.baseline, events: inWindow, window: input.window, plannedMonthly: input.plannedMonthly });
  return applyCapacityAdjustments(capacity, input.adjustments ?? []);
}

/**
 * Converts a What-If scenario into a set of monthly capacity adjustments.
 * One-time adjustments within the window are amortized over the window months.
 */
export function whatIfToCapacityAdjustments(
  adjustments: readonly import("../types/whatIf").WhatIfAdjustment[],
  calendarEvents: readonly CalendarEvent[],
  windowMonths: number
): CapacityAdjustment[] {
  const result: CapacityAdjustment[] = [];
  const safeMonths = Math.max(1, windowMonths);

  for (const adj of adjustments) {
    let monthlyDelta = 0;

    const getRemovedAmount = () => {
      if (!adj.sourceRef) return 0;
      const ev = calendarEvents.find((e) => e.id === adj.sourceRef!.refId || e.id.includes(adj.sourceRef!.refId));
      // Removing an outflow (direction "out") adds capacity. Removing an inflow subtracts capacity.
      if (ev && ev.amount !== null) return ev.amount * (ev.direction === "out" ? 1 : -1);
      return 0;
    };

    if (adj.operation === "add") {
      const amt = adj.amount * (adj.direction === "in" ? 1 : -1);
      monthlyDelta = adj.schedule.kind === "monthly" ? amt : adj.schedule.kind === "once" ? amt / safeMonths : 0;
    } else if (adj.operation === "remove") {
      monthlyDelta = getRemovedAmount();
    } else if (adj.operation === "replace") {
      const removed = getRemovedAmount();
      const amt = adj.amount * (adj.direction === "in" ? 1 : -1);
      const added = adj.schedule.kind === "monthly" ? amt : adj.schedule.kind === "once" ? amt / safeMonths : 0;
      monthlyDelta = removed + added;
    }

    if (monthlyDelta !== 0) {
      result.push({
        id: adj.id,
        label: adj.label,
        monthlyDelta: roundMoney(monthlyDelta),
        source: "what_if",
      });
    }
  }

  return result;
}
