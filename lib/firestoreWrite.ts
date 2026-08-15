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

function defaultLateFailure(error: unknown, label?: string): void {
  console.error(`Queued Firestore write failed${label ? ` (${label})` : ""}:`, error);
  toast.error(
    label
      ? `A saved ${label} could not be synced. Please check it.`
      : "A saved change could not be synced. Please check it."
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
      else defaultLateFailure(error, options.label);
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
