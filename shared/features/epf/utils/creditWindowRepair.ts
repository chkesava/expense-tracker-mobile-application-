/**
 * Forward healing for contribution rows written by earlier builds — SPENDLY-1,
 * extended by SPENDLY-72.
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
 * SPENDLY-72 added two more selectors here rather than a migration script,
 * for the same reason: every value needed is a pure function of data already
 * stored, so the fix can ride the repair pass the client and the cron already
 * run, and stays idempotent by construction.
 *
 * Must stay free of React and Firebase imports.
 */

import type { EpfContribution } from "@/shared/features/epf/types";
import { expectedCreditWindow } from "@/shared/features/epf/utils/schedule";

type RepairableRow = Pick<
  EpfContribution,
  "month" | "status" | "expectedCreditTo"
>;

type FabricatedCreditRow = Pick<
  EpfContribution,
  "status" | "source" | "reconciledAt" | "creditedAmount"
>;

type StrandedDraftRow = Pick<EpfContribution, "month" | "status">;

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


/**
 * Credits the pre-SPENDLY-72 scheduler invented — SPENDLY-72.
 *
 * KAN-68 advanced a month to `credited` once its credit window elapsed,
 * leaving `reconciledAt` unset to mark it a projection. The label was honest;
 * the data was not. `BALANCE_BEARING_STATUSES` counts `credited`, so the
 * projection reached the balance, History and net worth as though the money
 * had been observed — the misstatement the ticket calls financial integrity.
 *
 * These rows are withdrawn back to `expected`, where the calendar reading
 * (`deriveMonthState`) shows them as awaiting or overdue without asserting
 * anything. The user's own numbers are untouched: `applyActualCredit` always
 * stamps `reconciledAt`, and a hand-recorded credit carries `creditedAmount`.
 *
 * Idempotent: a withdrawn row is `expected`, nothing auto-credits any more, so
 * a second pass selects nothing.
 */
export function contributionsWithFabricatedCredit<T extends FabricatedCreditRow>(
  rows: T[]
): T[] {
  return rows.filter(
    (row) =>
      row.status === "credited" &&
      row.source === "simulated" &&
      !row.reconciledAt &&
      row.creditedAmount === undefined
  );
}

/**
 * Drafts stranded in the current or a future month — SPENDLY-72.
 *
 * Backfill used to generate rows up to and including the in-progress month, so
 * **Save draft** wrote `draft` documents for months that had not closed. Those
 * are lifecycle dead ends: `ALLOWED.draft` is empty, so Current could neither
 * credit them nor age them, and they carry no credit window either.
 *
 * A draft in the current or a future month is a generation artefact — nobody
 * asserted it — so it is healed to `expected` and given its window, which is
 * the state the scheduler would have produced. Past-month drafts are real
 * backfill work in progress and are left exactly where they are.
 *
 * `confirmed` months are *not* healed. Those the user did type, they are
 * already balance-bearing, and `ALLOWED.confirmed` now lets them take a real
 * credit instead.
 *
 * Idempotent: a healed row is `expected`, which this no longer selects.
 */
export function contributionsNeedingLifecycleRepair<T extends StrandedDraftRow>(
  rows: T[],
  currentMonth: string
): T[] {
  return rows.filter((row) => row.status === "draft" && row.month >= currentMonth);
}
