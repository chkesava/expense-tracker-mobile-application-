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
  | "queued"
  /**
   * Applied to an in-memory cache only — SPENDLY-1 / KAN-112.
   *
   * Same observable situation as `queued` (no server ack inside the grace
   * window) but there is no durable queue behind it, so a force-stop discards
   * the write. Split out because the two need different words: `queued` may
   * promise a later sync and this may not.
   */
  | "unsafe";

export type CommitWriteOptions = {
  /** Override the ack grace window (ms). */
  graceMs?: number;
  /** Short description used in late-failure logs, e.g. "expense". */
  label?: string;
  /** Called when the write fails after it was already reported as queued. */
  onLateFailure?: (error: unknown) => void;
  /**
   * Per-write durability (SPENDLY-23). The native outbox sets this after it
   * has persisted the mutation, so `queued` is truthful even though the SDK
   * cache is still memory-only.
   */
  durable?: boolean;
};

const QUEUED = Symbol("queued");

/**
 * Whether an unacked write is durably stored — SPENDLY-1 / KAN-112.
 *
 * Registered by `lib/firebase.ts` when the Firestore instance is created,
 * rather than imported from it: this module is unit-tested under plain Node,
 * and reaching into `lib/firebase` would pull `react-native` and the whole
 * Firebase SDK into that test. Registration happens in `createDb`, which every
 * write path must go through to get a `db` at all, so it cannot be missed.
 *
 * Starts `false` so an unregistered environment understates durability rather
 * than overstating it — the direction of error this ticket exists to fix.
 */
let writeQueueDurable = false;

export function setWriteQueueDurable(durable: boolean): void {
  writeQueueDurable = durable;
}

/** Test seam. */
export function isWriteQueueDurable(): boolean {
  return writeQueueDurable;
}

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
    if (result !== QUEUED) return "acked";
    return options.durable || writeQueueDurable ? "queued" : "unsafe";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Success copy for a write, telling the user when it is only saved locally.
 * `toast.success(writeSavedMessage(outcome, "Expense logged"))`
 *
 * `unsafe` deliberately does not say "will sync". On native there is no durable
 * queue to make that true (KAN-112), and SPENDLY-1 was reported precisely
 * because the app said "offline, will sync" over a write that a force-stop
 * would have thrown away.
 */
export function writeSavedMessage(outcome: WriteOutcome, message: string): string {
  if (outcome === "acked") return message;
  if (outcome === "queued") return `${message} — offline, will sync`;
  return `${message} on this device — keep the app open until it syncs`;
}
