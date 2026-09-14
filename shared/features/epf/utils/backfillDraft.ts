/**
 * Backfill draft state — SPENDLY-1.
 *
 * The backfill screen used to hold every generated month and every hand-edit in
 * component-local `useState`, and the establishment screen renders its tabs
 * through a ternary — so changing tab unmounted the screen and destroyed the
 * edits with no warning. The decisions that make that safe live here rather
 * than in the component, because `vitest.config.ts` never collects
 * `components/**`.
 *
 * Must stay free of React and Firebase imports.
 */

import type {
  EpfBackfillRow,
  EpfContributionStatus,
} from "@/shared/features/epf/types";

/**
 * Overlay pending edits onto the generated month list.
 *
 * Order is load-bearing: `groupContributionsByFinancialYear` and the list
 * `items` memo both assume month-ascending, which is the order
 * `buildBackfillRows` produces.
 */
export function mergeBackfillEdits(
  generated: EpfBackfillRow[],
  edits: Map<string, EpfBackfillRow>
): EpfBackfillRow[] {
  if (edits.size === 0) return generated;
  return generated.map((row) => edits.get(row.month) ?? row);
}

/** Record a hand-edit. Returns a new Map — see `clearSavedEdits`. */
export function upsertBackfillEdit(
  edits: Map<string, EpfBackfillRow>,
  row: EpfBackfillRow
): Map<string, EpfBackfillRow> {
  const next = new Map(edits);
  next.set(row.month, row);
  return next;
}

/**
 * Drop edits that are now durable, so the Firestore snapshot becomes the source
 * of truth for those months.
 *
 * Always returns a new Map even when nothing changed: the list's `extraData`
 * keys off `edits.size`, so a same-size swap (one month saved, another edited)
 * must still be a new identity or the rows will not re-render.
 */
export function clearSavedEdits(
  edits: Map<string, EpfBackfillRow>,
  savedMonths: string[]
): Map<string, EpfBackfillRow> {
  const next = new Map(edits);
  for (const month of savedMonths) next.delete(month);
  return next;
}

/**
 * The status to write when a single month is applied from the edit sheet.
 *
 * `saveContributions` writes `status` unconditionally with no `canTransition`
 * check (SPENDLY-15). Sending `"draft"` for every applied edit would therefore
 * demote an already-`confirmed` month and wipe a `credited` month's lifecycle
 * state — strictly worse than the bug being fixed. So a month that already has
 * a document keeps its status, and only a brand-new month becomes a draft.
 *
 * Every result is either the row's current status or a transition
 * `canTransition` permits; `backfillDraft.test.ts` asserts that against the
 * real table so this stays true when SPENDLY-15 tightens the write path.
 */
export function statusForAppliedEdit(row: EpfBackfillRow): EpfContributionStatus {
  return row.persisted ? row.status : "draft";
}

export interface UnsavedBackfillSummary {
  /** Months edited but not yet durable. */
  count: number;
  months: string[];
  /** True when leaving the screen would lose something. */
  dirty: boolean;
  label: string;
}

/**
 * What the footer chip shows and what the leave-confirmation gates on.
 *
 * A typed wage counts as unsaved work even with no per-month edits: it is the
 * bulk-fill input, and `Save draft` is the only thing that commits it.
 */
export function unsavedBackfillSummary(args: {
  edits: Map<string, EpfBackfillRow>;
  wage: string;
  /**
   * The wage as of the last successful bulk save, if any.
   *
   * Without this the screen stays "dirty" forever after a Save draft — the
   * wage box still holds a value, so every later tab switch would prompt about
   * work that is already durable.
   */
  savedWage?: string;
}): UnsavedBackfillSummary {
  const months = [...args.edits.keys()].sort();
  const count = months.length;
  const hasWage = Number(args.wage) > 0 && args.wage !== args.savedWage;

  return {
    count,
    months,
    dirty: count > 0 || hasWage,
    label:
      count > 0
        ? `${count} unsaved ${count === 1 ? "month" : "months"}`
        : hasWage
          ? "Unsaved wage"
          : "",
  };
}

/** Copy for the leave-confirmation dialog. */
export function unsavedChangesPrompt(summary: UnsavedBackfillSummary): {
  title: string;
  message: string;
} {
  return {
    title: "Unsaved backfill",
    message:
      summary.count > 0
        ? `${summary.label} would be lost. Save them as drafts first?`
        : "The wage you typed has not been saved. Save these months as drafts first?",
  };
}

/**
 * Months Backfill Save may write — SPENDLY-68.
 *
 * Bulk wage fills empty months only. Persisted documents are never rewritten
 * just because a wage is typed; per-month edits (and explicit replace after
 * confirm) are the only way to change a saved month.
 */
export function backfillSaveRows(args: {
  rows: EpfBackfillRow[];
  edits: Map<string, EpfBackfillRow>;
  wage: number;
}): EpfBackfillRow[] {
  const out: EpfBackfillRow[] = [];
  for (const row of args.rows) {
    const edit = args.edits.get(row.month);
    if (edit) {
      out.push(edit);
      continue;
    }
    if (row.persisted) continue;
    if (args.wage > 0 && row.wage > 0) out.push(row);
  }
  return out;
}

/** True when Apply would change a saved month's wage or contribution shares. */
export function persistedAmountsDiffer(
  saved: Pick<
    EpfBackfillRow,
    "wage" | "employeeShare" | "employerShare" | "epsShare"
  >,
  next: Pick<
    EpfBackfillRow,
    "wage" | "employeeShare" | "employerShare" | "epsShare"
  >
): boolean {
  return (
    saved.wage !== next.wage ||
    saved.employeeShare !== next.employeeShare ||
    saved.employerShare !== next.employerShare ||
    saved.epsShare !== next.epsShare
  );
}
