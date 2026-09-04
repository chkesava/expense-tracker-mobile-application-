/**
 * Firestore write helpers that stay responsive offline.
 *
 * A Firestore write promise (`addDoc` / `setDoc` / `updateDoc` / `deleteDoc` /
 * `batch.commit`) only settles once the **server** acknowledges the mutation.
 * With persistent local cache enabled the mutation is applied to the cache and
 * durably queued the moment the call is made, but the returned promise stays
 * pending indefinitely while the device is offline or the connection stalls.
 *
 * Awaiting that promise directly is what freezes a save button on a change that
 * has, in fact, already been saved. `commitWrite` waits a short grace period for
 * the server ack and then reports the write as `queued`, so a caller can close
 * its sheet and tell the user the change is saved and will sync.
 *
 * Failures that arrive *before* the grace window elapses (permission denied,
 * invalid argument, …) still reject, so existing try/catch error paths keep
 * working unchanged. Failures that arrive *after* it are reported through
 * `onLateFailure` instead of becoming unhandled rejections.
 */

import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";

/** How long to wait for a server ack before treating the write as queued. */
export const SERVER_ACK_GRACE_MS = 1500;

export type WriteOutcome =
  /** The server confirmed the write before the grace window elapsed. */
  | "acked"
  /** The write is durably queued locally and will sync when back online. */
  | "queued";

export type CommitWriteOptions = {
  /** Override the ack grace window (ms). */
  graceMs?: number;
  /** Short description used in late-failure logs, e.g. "expense". */
  label?: string;
  /** Called when the write fails after it was already reported as queued. */
  onLateFailure?: (error: unknown) => void;
};

const QUEUED = Symbol("queued");

/**
 * A write that failed *after* it was reported as queued (GS-030).
 *
 * This is the worst moment to be vague: the user was already told it saved and
 * has very likely navigated away, so the message has to say what failed and
 * why, and it is the only notice they will get.
 *
 * Goes through `lib/errors.ts` like every other user-facing failure — it used
 * to call `console.error` and `toast.error` directly with fixed copy, which
 * meant a permission denial and a lost connection read identically and neither
 * was captured with the redaction and context the rest of the app uses.
 *
 * Exported so a caller that needs its own `onLateFailure` — to clean up a
 * Storage object the failed write was going to reference (GS-069) — can still
 * give the user the notice this would have given. Supplying `onLateFailure`
 * replaces this reporter rather than adding to it, so a caller that forgets to
 * call it leaves the user believing a write landed when it did not.
 */
export function reportLateWriteFailure(error: unknown, label?: string): void {
  logError("firestoreWrite.lateFailure", error, { label });
  const reason = friendlyErrorMessage(error, "It could not be synced.");
  toast.error(
    label
      ? `Your ${label} was not saved after all. ${reason}`
      : `A change was not saved after all. ${reason}`
  );
}

/**
 * Runs a Firestore write and resolves as soon as it is durably recorded —
 * either acknowledged by the server or queued in the local persistence layer.
 */
export async function commitWrite(
  run: () => Promise<unknown>,
  options: CommitWriteOptions = {}
): Promise<WriteOutcome> {
  const graceMs = options.graceMs ?? SERVER_ACK_GRACE_MS;
  let graceElapsed = false;

  // `run` may throw synchronously (e.g. invalid payload) — keep it a rejection.
  const write = Promise.resolve().then(run);

  const tracked = write.then(
    () => undefined,
    (error: unknown) => {
      if (!graceElapsed) throw error;
      if (options.onLateFailure) options.onLateFailure(error);
      else reportLateWriteFailure(error, options.label);
      return undefined;
    }
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  const grace = new Promise<typeof QUEUED>((resolve) => {
    timer = setTimeout(() => {
      graceElapsed = true;
      resolve(QUEUED);
    }, graceMs);
  });

  try {
    const result = await Promise.race([tracked, grace]);
    return result === QUEUED ? "queued" : "acked";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Success copy for a write, telling the user when it is only saved locally.
 * `toast.success(writeSavedMessage(outcome, "Expense logged"))`
 */
export function writeSavedMessage(outcome: WriteOutcome, message: string): string {
  return outcome === "acked" ? message : `${message} — offline, will sync`;
}
