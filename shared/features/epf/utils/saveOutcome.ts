/**
 * What a multi-month Backfill save actually did — SPENDLY-1.
 *
 * The old `saveContributions` returned `{ saved, failed }` where `saved` was
 * incremented by `group.length` the instant `commitWrite` resolved, and the
 * toast reported the **last chunk's** outcome for the whole operation. Two
 * different lies in one sentence: rows that were only queued were counted as
 * saved, and a save whose first chunk was acked while its second was queued
 * described itself entirely by the second.
 *
 * The ticket's requirement is that every affected month has an explicit
 * persistence result, so that is what the hook now collects and this module
 * folds. Reporting stays a pure function of that list.
 *
 * Must stay free of React and Firebase imports, which is also why the outcome
 * union is declared here rather than imported from `lib/firestoreWrite`:
 * `lib/toast` pulls in React. The two unions are kept structurally compatible
 * and `saveOutcome.test.ts` pins the overlap.
 */

/** Per-month persistence result. Mirrors `WriteOutcome` plus an error case. */
export type EpfMonthWriteOutcome = "acked" | "queued" | "unsafe" | "failed";

export interface EpfMonthSaveResult {
  month: string;
  outcome: EpfMonthWriteOutcome;
  /** Why it failed, already passed through `friendlyErrorMessage`. */
  reason?: string;
}

export interface EpfSaveSummary {
  total: number;
  /** Months that reached durable-or-acked storage. */
  saved: number;
  acked: number;
  queued: number;
  unsafe: number;
  failed: number;
  /** Months to name in the retry banner, ascending. */
  failedMonths: string[];
  /** True when the user must be told something went wrong. */
  hasFailures: boolean;
  /** Empty when there was nothing to save. */
  message: string;
  tone: "success" | "error";
}

function plural(count: number): string {
  return count === 1 ? "month" : "months";
}

/**
 * Fold per-month results into one report.
 *
 * Partial success is never presented as complete success: if anything failed
 * the message leads with the counts and the tone is `error`, whatever the rest
 * of the batch did.
 *
 * Ordering of the success cases is deliberate — worst news wins. A save that is
 * part acked and part `unsafe` reports as `unsafe`, because the weakest month
 * is what the user needs to act on.
 */
export function summarizeSaveResults(
  results: readonly EpfMonthSaveResult[]
): EpfSaveSummary {
  const count = (outcome: EpfMonthWriteOutcome) =>
    results.filter((row) => row.outcome === outcome).length;

  const acked = count("acked");
  const queued = count("queued");
  const unsafe = count("unsafe");
  const failed = count("failed");
  const saved = acked + queued + unsafe;
  const total = results.length;

  const failedMonths = results
    .filter((row) => row.outcome === "failed")
    .map((row) => row.month)
    .sort();

  let message = "";
  if (total === 0) {
    message = "";
  } else if (failed > 0) {
    message =
      saved > 0
        ? `Saved ${saved} of ${total} ${plural(total)}. ${failed} could not be saved — try again.`
        : `Couldn't save ${failed} ${plural(failed)}. Try again.`;
  } else if (unsafe > 0) {
    // No durable queue behind this write (KAN-112): promising a later sync
    // would be the same false claim the ticket is about.
    message = `Saved ${saved} ${plural(saved)} on this device — keep the app open until they sync.`;
  } else if (queued > 0) {
    message = `Saved ${saved} ${plural(saved)} — offline, will sync`;
  } else {
    message = `Saved ${saved} ${plural(saved)}`;
  }

  return {
    total,
    saved,
    acked,
    queued,
    unsafe,
    failed,
    failedMonths,
    hasFailures: failed > 0,
    message,
    tone: failed > 0 ? "error" : "success",
  };
}

/**
 * Months that left the unsaved/dirty state.
 *
 * `failed` months stay in `edits` so **Save all** can retry them; everything
 * else is now owned by the Firestore snapshot. An `unsafe` month counts as
 * saved here on purpose — the write did reach the local cache, and holding it
 * in `edits` as well would double-report it.
 */
export function persistedMonths(
  results: readonly EpfMonthSaveResult[]
): string[] {
  return results
    .filter((row) => row.outcome !== "failed")
    .map((row) => row.month);
}
