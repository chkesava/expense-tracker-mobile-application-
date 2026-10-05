/**
 * Effective-dated EPF wage changes — SPENDLY-389.
 *
 * A sibling of `contributions.ts`/`schedule.ts`: everything here is pure, no
 * React or Firebase imports, so `npm test` covers it even though `hooks/**`
 * and `components/**` are not collected by `vitest.config.ts`.
 */

import {
  computeEpfContribution,
  type EpfContributionComputation,
} from "@/shared/features/epf/utils/contributions";
import type { EpfContribution, EpfWageHistoryEntry } from "@/shared/features/epf/types";
import { isValidMonthKey } from "@/shared/utils/dates";
import { roundMoney } from "@/shared/utils/money";

/**
 * The wage in force for a given month, per the wage-history schedule.
 *
 * Newest `effectiveFromMonth <= month` wins — the same rule
 * `findEpfContributionRule` applies to the statutory slab table. Falls back to
 * `fallbackWage` (normally `wageForProjection(existing)`) when no entry
 * applies yet, so an establishment with no wage-history entries keeps
 * projecting exactly as it did before this ticket.
 */
export function wageForMonth(
  history: Pick<EpfWageHistoryEntry, "effectiveFromMonth" | "wage">[],
  month: string,
  fallbackWage: number
): number {
  const applicable = history
    .filter((entry) => entry.effectiveFromMonth <= month)
    .sort((a, b) => (a.effectiveFromMonth > b.effectiveFromMonth ? -1 : 1));
  return applicable.length > 0 ? applicable[0].wage : fallbackWage;
}

/**
 * The entry a given month should be previewed/edited against — the one whose
 * `effectiveFromMonth` is in force, used by the "Change EPF wage" sheet to
 * show the right starting point.
 */
export function wageHistoryEntryForMonth(
  history: EpfWageHistoryEntry[],
  month: string
): EpfWageHistoryEntry | null {
  const applicable = history
    .filter((entry) => entry.effectiveFromMonth <= month)
    .sort((a, b) => (a.effectiveFromMonth > b.effectiveFromMonth ? -1 : 1));
  return applicable[0] ?? null;
}

export function sortWageHistoryByEffectiveFrom(
  history: EpfWageHistoryEntry[]
): EpfWageHistoryEntry[] {
  return [...history].sort((a, b) =>
    a.effectiveFromMonth < b.effectiveFromMonth ? -1 : a.effectiveFromMonth > b.effectiveFromMonth ? 1 : 0
  );
}

export type EpfWageChangeIssueCode =
  | "invalid_month"
  | "duplicate_effective_month"
  | "negative_amount"
  | "eps_exceeds_employer";

export interface EpfWageChangeIssue {
  field?: string;
  code: EpfWageChangeIssueCode;
  message: string;
}

/**
 * Validation for a new wage-history entry, collected rather than thrown —
 * same convention as `validateEpfContribution`.
 */
export function validateWageChange(
  entry: Pick<
    EpfWageHistoryEntry,
    "effectiveFromMonth" | "wage" | "employerShareOverride" | "epsShareOverride"
  >,
  existing: Pick<EpfWageHistoryEntry, "effectiveFromMonth">[]
): EpfWageChangeIssue[] {
  const issues: EpfWageChangeIssue[] = [];

  if (!isValidMonthKey(entry.effectiveFromMonth)) {
    issues.push({
      field: "effectiveFromMonth",
      code: "invalid_month",
      message: "Pick a valid effective month.",
    });
  } else if (existing.some((row) => row.effectiveFromMonth === entry.effectiveFromMonth)) {
    issues.push({
      field: "effectiveFromMonth",
      code: "duplicate_effective_month",
      message: "A wage change already starts this month. Edit that one instead.",
    });
  }

  if (entry.wage < 0) {
    issues.push({ field: "wage", code: "negative_amount", message: "Wage cannot be negative." });
  }

  if (
    entry.epsShareOverride !== undefined &&
    entry.employerShareOverride !== undefined &&
    entry.epsShareOverride > entry.employerShareOverride
  ) {
    issues.push({
      field: "epsShareOverride",
      code: "eps_exceeds_employer",
      message: "Pension share cannot exceed the employer contribution.",
    });
  }

  return issues;
}

/** The statutory preview for a wage-history entry, before any manual override. */
export function previewWageChange(entry: {
  wage: number;
  effectiveFromMonth: string;
  epsEligible: boolean;
}): EpfContributionComputation {
  return computeEpfContribution({
    wage: entry.wage,
    month: entry.effectiveFromMonth,
    epsEligible: entry.epsEligible,
  });
}

/** True once a manual share override diverges from the statutory preview. */
export function isWageChangeOverridden(
  entry: Pick<
    EpfWageHistoryEntry,
    "employeeShareOverride" | "employerShareOverride" | "epsShareOverride"
  >,
  computed: EpfContributionComputation
): boolean {
  return (
    (entry.employeeShareOverride !== undefined &&
      entry.employeeShareOverride !== computed.employeeShare) ||
    (entry.employerShareOverride !== undefined &&
      entry.employerShareOverride !== computed.employerShare) ||
    (entry.epsShareOverride !== undefined && entry.epsShareOverride !== computed.epsShare)
  );
}

/**
 * Whether an existing contribution for the wage change's effective month may
 * be updated without an explicit confirmation — SPENDLY-389 scope item 6.
 *
 * Mirrors `canOverwriteWithSimulated`/`isEligibleForAutomatedProcessing`: a
 * row nobody has confirmed or credited yet is still a projection, so
 * reprojecting it at the new wage is safe. Anything else — a hand-entered,
 * confirmed or credited month — is the user's data and must not move without
 * them saying so.
 */
export function wageChangeNeedsConfirmation(
  existing: Pick<EpfContribution, "source" | "status"> | undefined
): boolean {
  if (!existing) return false;
  if (existing.source === "manualHistorical" || existing.source === "imported") return true;
  return existing.status !== "draft" && existing.status !== "expected";
}

/** The stored write shape for a new wage-history entry. `createdAtMs`/`updatedAtMs` are the caller's job (pinned by the rule). */
export function wageHistoryWritePayload(
  entry: Omit<EpfWageHistoryEntry, "id" | "createdAtMs" | "updatedAtMs">
): Record<string, unknown> {
  return {
    establishmentId: entry.establishmentId,
    effectiveFromMonth: entry.effectiveFromMonth,
    wage: roundMoney(entry.wage),
    epsEligible: entry.epsEligible,
    employeeShareOverride: entry.employeeShareOverride,
    employerShareOverride: entry.employerShareOverride,
    epsShareOverride: entry.epsShareOverride,
    employerEpfShareOverride: entry.employerEpfShareOverride,
    rulesVersion: entry.rulesVersion,
    notes: entry.notes || undefined,
  };
}

/** Tolerant read: a malformed/legacy doc degrades to safe defaults rather than throwing. */
export function normalizeWageHistoryEntry(
  id: string,
  raw: Record<string, unknown>
): EpfWageHistoryEntry {
  const num = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  const optionalNum = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const str = (value: unknown): string | undefined =>
    typeof value === "string" && value ? value : undefined;

  return {
    id,
    establishmentId: str(raw.establishmentId) ?? "",
    effectiveFromMonth: str(raw.effectiveFromMonth) ?? "",
    wage: num(raw.wage),
    epsEligible: raw.epsEligible !== false,
    employeeShareOverride: optionalNum(raw.employeeShareOverride),
    employerShareOverride: optionalNum(raw.employerShareOverride),
    epsShareOverride: optionalNum(raw.epsShareOverride),
    employerEpfShareOverride: optionalNum(raw.employerEpfShareOverride),
    rulesVersion: str(raw.rulesVersion),
    notes: str(raw.notes),
    createdAtMs: num(raw.createdAtMs),
    updatedAtMs: num(raw.updatedAtMs),
  };
}
