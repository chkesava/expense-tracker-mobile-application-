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

export const BACKFILL_REFUSED_REASON =
  "Only draft or confirmed months can be changed from Backfill.";

export const BACKFILL_DEMOTE_REASON =
  "A confirmed month cannot be saved as a draft.";

export const BACKFILL_ARCHIVED_REASON =
  "That month was removed. It cannot be rewritten from Backfill.";

/**
 * Whether Backfill Save / Apply may touch this stored status (SPENDLY-15).
 *
 * Lifecycle rows (`expected` / `credited` / …) move through `applyTransition`,
 * not through a blanket `status: "confirmed"` merge.
 */
export function isBackfillMutableStatus(
  status: EpfContributionStatus | undefined,
  archived?: boolean
): boolean {
  if (archived) return false;
  if (!status) return true;
  return status === "draft" || status === "confirmed";
}

export type BackfillSaveDecision =
  | { ok: true; status: EpfContributionStatus }
  | { ok: false; reason: string };

/**
 * The status Backfill is allowed to write.
 *
 * New and `draft` rows may become `draft` or `confirmed`. `confirmed` may be
 * rewritten as `confirmed` (amount edits) but not demoted. Everything else is
 * refused so a Save draft cannot clobber a cron-credited month.
 */
export function resolveBackfillSaveStatus(args: {
  existingStatus?: EpfContributionStatus;
  archived?: boolean;
  requested: EpfContributionStatus;
}): BackfillSaveDecision {
  if (args.archived) return { ok: false, reason: BACKFILL_ARCHIVED_REASON };
  if (!args.existingStatus) {
    if (args.requested === "draft" || args.requested === "confirmed") {
      return { ok: true, status: args.requested };
    }
    return { ok: false, reason: BACKFILL_REFUSED_REASON };
  }
  if (args.existingStatus === "draft") {
    if (args.requested === "draft" || args.requested === "confirmed") {
      return { ok: true, status: args.requested };
    }
    return { ok: false, reason: BACKFILL_REFUSED_REASON };
  }
  if (args.existingStatus === "confirmed") {
    if (args.requested === "draft") return { ok: false, reason: BACKFILL_DEMOTE_REASON };
    if (args.requested === "confirmed") return { ok: true, status: "confirmed" };
    return { ok: false, reason: BACKFILL_REFUSED_REASON };
  }
  return { ok: false, reason: BACKFILL_REFUSED_REASON };
}

export type ContributionRemovalKind = "delete" | "archive" | "missing";

/**
 * Drafts are not history yet — `deleteDoc` is fine. Anything else is archived
 * in place so the scheduler cannot resurrect a blank month (SPENDLY-19 leftover
 * still has to skip `archived`).
 */
export function contributionRemovalKind(
  row: { status: EpfContributionStatus; archived?: boolean } | undefined
): ContributionRemovalKind {
  if (!row || row.archived) return "missing";
  if (row.status === "draft") return "delete";
  return "archive";
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
 * Months Backfill Save may write — SPENDLY-68, reopened by SPENDLY-1.
 *
 * Bulk wage fills empty months only. Persisted documents are never rewritten
 * just because a wage is typed; per-month edits (and explicit replace after
 * confirm) are the only way to change a saved month.
 *
 * The one exception is the **promotion path**. `applyEdit` persists every
 * edited month immediately as a `draft`, so after a few edits the screen is
 * full of rows that are `persisted` *and* `draft`. Skipping all persisted rows
 * meant **Save all** silently passed over exactly the months the user had just
 * typed and wrote only the leftover wage-filled one — the reported
 * "Saved 1 month" — and left the drafts unable to leave `draft` by any route,
 * because `ALLOWED.draft` is `[]` and nothing else promotes them.
 *
 * So a persisted `draft` is included when saving as `confirmed`, and only then.
 * Its amounts come from the stored document, so the write is identical-value
 * and idempotent (deterministic id + `merge`). Every other persisted status —
 * `confirmed`, `credited`, `partial`, `missed`, `reversed` — is still skipped,
 * which is the part SPENDLY-68 cares about: a recalculated suggestion must
 * never overwrite an actual remittance.
 */
export function backfillSaveRows(args: {
  rows: EpfBackfillRow[];
  edits: Map<string, EpfBackfillRow>;
  wage: number;
  /** The status the save is writing. Promotion only happens for `confirmed`. */
  status: EpfContributionStatus;
}): EpfBackfillRow[] {
  const out: EpfBackfillRow[] = [];
  for (const row of args.rows) {
    const edit = args.edits.get(row.month);
    if (edit) {
      if (row.persisted && !isBackfillMutableStatus(row.status, row.archived)) {
        continue;
      }
      out.push(edit);
      continue;
    }
    if (row.persisted) {
      if (args.status === "confirmed" && row.status === "draft") out.push(row);
      continue;
    }
    if (args.wage > 0 && row.wage > 0) out.push(row);
  }
  return out;
}

export interface BackfillRowPresentation {
  /** Show amounts rather than the "not recorded" placeholder. */
  recorded: boolean;
  /** Calculated from the wage and not yet written — must never read as saved. */
  suggested: boolean;
  /**
   * A durable `draft` document — SPENDLY-1.
   *
   * Distinct from `suggested`, and the distinction is the whole confusion in
   * the ticket: a generated row and a saved-but-unconfirmed row both rendered
   * the bare chip "Draft", so a user who had saved eight months saw the same
   * word as before saving and concluded nothing had been written.
   */
  savedDraft: boolean;
}

/**
 * How one backfill row should read — SPENDLY-69.
 *
 * A wage-filled month used to render exactly like a persisted one, so the
 * screen showed amounts History and Balance knew nothing about. The amounts
 * still show (previewing the bulk fill is the point of the screen) but the row
 * has to say it is only a suggestion.
 *
 * Lives here rather than in the component because `vitest.config.ts` never
 * collects `components/**`.
 */
export function backfillRowPresentation(
  row: Pick<EpfBackfillRow, "persisted" | "epfCredit" | "status">
): BackfillRowPresentation {
  return {
    recorded: row.persisted || row.epfCredit > 0,
    suggested: !row.persisted && row.epfCredit > 0,
    savedDraft: row.persisted && row.status === "draft",
  };
}

/**
 * The chip a backfill row shows — SPENDLY-1.
 *
 * Says "saved" out loud for a durable draft, so the screen stops reading as
 * though Save did nothing. Lives here, not in the row component, because
 * `vitest.config.ts` never collects `components/**`.
 */
export function backfillStatusLabel(
  statusLabel: string,
  presentation: Pick<BackfillRowPresentation, "savedDraft">
): string {
  return presentation.savedDraft ? `${statusLabel} · saved` : statusLabel;
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
