/**
 * SPENDLY-615 — read-only audit of one user's goals, for the legacy dry-run
 * report (scripts/save-goals-legacy-report.ts) and the read-model parity check.
 *
 * Output carries ids and counts only: never goal names, amounts or notes.
 * Nothing here writes; the upgrade itself is lazy (first write per goal) and
 * needs no backfill.
 */

import type { FinancialGoal } from "../types/expense";
import type { GoalEvent } from "../types/goal";
import { GOAL_LIMITS } from "../types/goal";
import { isLegacyGoal, normalizeGoalName } from "./goalModel";
import { reconcileGoal } from "./goalReconcile";

export type GoalAuditReport = {
  goals: number;
  legacy: number;
  upgraded: number;
  /** Groups of goal ids sharing a normalized name — their upgrade will ask for a rename. */
  duplicateNameGroups: string[][];
  /** Goals whose stored amounts couldn't be written by the v2 rules (negative, non-finite, ≥ 1e9). */
  invalidAmounts: string[];
  /** Upgraded goals whose history doesn't explain the saved amount (difference only). */
  reconcileMismatches: { goalId: string; difference: number }[];
  /** Upgraded goals not checked because their history wasn't provided. */
  notReconciled: number;
};

const validAmount = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= GOAL_LIMITS.maxAmount;

export function auditGoals(goals: readonly FinancialGoal[], eventsByGoal?: ReadonlyMap<string, readonly GoalEvent[]>): GoalAuditReport {
  const byName = new Map<string, string[]>();
  const invalidAmounts: string[] = [];
  const reconcileMismatches: { goalId: string; difference: number }[] = [];
  let legacy = 0;
  let notReconciled = 0;

  for (const g of goals) {
    const key = normalizeGoalName(g.name ?? "");
    byName.set(key, [...(byName.get(key) ?? []), g.id]);
    if (!validAmount(g.currentAmount) || !validAmount(g.targetAmount) || g.targetAmount <= 0) invalidAmounts.push(g.id);
    if (isLegacyGoal(g)) {
      legacy += 1;
      continue;
    }
    const events = eventsByGoal?.get(g.id);
    if (!events) {
      notReconciled += 1;
      continue;
    }
    const r = reconcileGoal(g, events);
    if (!r.ok) reconcileMismatches.push({ goalId: g.id, difference: r.difference });
  }

  return {
    goals: goals.length,
    legacy,
    upgraded: goals.length - legacy,
    duplicateNameGroups: [...byName.values()].filter((ids) => ids.length > 1).map((ids) => [...ids].sort()),
    invalidAmounts: invalidAmounts.sort(),
    reconcileMismatches,
    notReconciled,
  };
}

/** Totals across users, for the report's summary line. */
export function summarizeAudits(reports: readonly GoalAuditReport[]) {
  return reports.reduce(
    (s, r) => ({
      users: s.users + 1,
      goals: s.goals + r.goals,
      legacy: s.legacy + r.legacy,
      upgraded: s.upgraded + r.upgraded,
      duplicateNameGroups: s.duplicateNameGroups + r.duplicateNameGroups.length,
      invalidAmounts: s.invalidAmounts + r.invalidAmounts.length,
      reconcileMismatches: s.reconcileMismatches + r.reconcileMismatches.length,
    }),
    { users: 0, goals: 0, legacy: 0, upgraded: 0, duplicateNameGroups: 0, invalidAmounts: 0, reconcileMismatches: 0 }
  );
}
