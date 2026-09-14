/**
 * Credit-window repair — SPENDLY-1.
 *
 * `saveContributions` used to drop `expectedCreditFrom`/`expectedCreditTo`, so
 * every `expected` month written by the *client* catch-up path
 * (`useEpfCatchUp`) lacks them. The cron path is unaffected: `epf-cron.ts`
 * spreads the whole row, so its rows have always carried the window.
 *
 * Those client-written rows cannot heal themselves. `monthsToGenerate` skips
 * any month that already exists, so the planner never revisits them and
 * `saveContributions` is never called for them again — without this repair they
 * stay `expected` forever and never auto-credit.
 *
 * Must stay free of React and Firebase imports.
 */

import type { EpfContribution } from "@/shared/features/epf/types";
import { expectedCreditWindow } from "@/shared/features/epf/utils/schedule";

type RepairableRow = Pick<
  EpfContribution,
  "month" | "status" | "expectedCreditTo"
>;

/**
 * The rows that need a window stamped on them.
 *
 * Only `expected` months qualify. A `confirmed` historical month must never
 * acquire a window: `contributionsToAutoCredit` would then be one status change
 * away from treating user-asserted history as a projection to advance, and
 * `ALLOWED.confirmed` deliberately forbids `confirmed → credited`.
 *
 * Keyed off `expectedCreditTo` because that is the field
 * `isCreditWindowPassed` reads, so a half-written document with only
 * `expectedCreditFrom` is still selected.
 *
 * Idempotent: feeding the repaired rows back returns an empty list.
 */
export function contributionsMissingCreditWindow<T extends RepairableRow>(
  rows: T[]
): T[] {
  return rows.filter((row) => row.status === "expected" && !row.expectedCreditTo);
}

/**
 * The window a given month should have had.
 *
 * Pure function of the contribution month, which is what makes fixing this
 * forward possible with no data migration — the correct value can always be
 * recomputed from what is already stored.
 */
export function creditWindowRepairFor(row: Pick<EpfContribution, "month">): {
  expectedCreditFrom: string;
  expectedCreditTo: string;
} {
  const window = expectedCreditWindow(row.month);
  return { expectedCreditFrom: window.from, expectedCreditTo: window.to };
}
