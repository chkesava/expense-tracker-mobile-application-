/**
 * SPENDLY-607 — Save Goals reconciliation.
 *
 *   openingAmount + Σ goalEvents.amountDelta == currentAmount
 *
 * The goal document's `currentAmount` is the materialized summary the app
 * shows; the event log is the audit trail that explains it. Rules keep the two
 * in step write by write (SPENDLY-609). This check is the read-side proof, used
 * by the "verify history" action and the read-model parity check (SPENDLY-615).
 *
 * Money is compared to the paisa: increments of two-decimal amounts can leave
 * binary float dust (0.1 + 0.2), which is not a discrepancy.
 */

import type { FinancialGoal } from "../types/expense";
import type { GoalEvent } from "../types/goal";
import { goalOpeningAmount } from "./goalModel";
import { roundMoney } from "./money";

export const RECONCILE_TOLERANCE = 0.005;

export type GoalReconciliation = {
  opening: number;
  eventTotal: number;
  expected: number;
  actual: number;
  difference: number;
  ok: boolean;
  /** Events for a different goal that were passed in by mistake (ignored). */
  foreignEvents: number;
};

export function reconcileGoal(
  goal: Pick<FinancialGoal, "id" | "currentAmount" | "openingAmount" | "schemaVersion">,
  events: readonly Pick<GoalEvent, "goalId" | "amountDelta">[]
): GoalReconciliation {
  let eventTotal = 0;
  let foreignEvents = 0;
  for (const e of events) {
    if (e.goalId !== goal.id) {
      foreignEvents += 1;
      continue;
    }
    if (typeof e.amountDelta === "number" && Number.isFinite(e.amountDelta)) eventTotal += e.amountDelta;
  }
  const opening = goalOpeningAmount(goal);
  const expected = roundMoney(opening + eventTotal);
  const actual = roundMoney(typeof goal.currentAmount === "number" ? goal.currentAmount : 0);
  const difference = roundMoney(actual - expected);
  return {
    opening,
    eventTotal: roundMoney(eventTotal),
    expected,
    actual,
    difference,
    ok: Math.abs(difference) < RECONCILE_TOLERANCE,
    foreignEvents,
  };
}

/**
 * Ids of amount events that have already been reversed. A reversal's id is
 * `${originalId}__rev` (see goalWrites), so this is also what the rules' create-
 * only semantics enforce: one reversal per event, ever.
 */
export function reversedEventIds(events: readonly Pick<GoalEvent, "type" | "correctionOf">[]): Set<string> {
  const out = new Set<string>();
  for (const e of events) if (e.type === "reversal" && e.correctionOf) out.add(e.correctionOf);
  return out;
}

/**
 * The effective amount of an amount event after its corrections: the original
 * delta plus every correction/reversal that points at it.
 */
export function effectiveEventAmount(
  original: Pick<GoalEvent, "id" | "amountDelta">,
  events: readonly Pick<GoalEvent, "type" | "correctionOf" | "amountDelta">[]
): number {
  let total = original.amountDelta;
  for (const e of events) {
    if ((e.type === "correction" || e.type === "reversal") && e.correctionOf === original.id) total += e.amountDelta;
  }
  return roundMoney(total);
}
