/**
 * Shared handling for Firestore listener failures.
 *
 * `onSnapshot` error callbacks used to only `console.error`, which meant an
 * expired or revoked session — the listener detaching with `permission-denied`
 * / `unauthenticated` — left the screen showing whatever was last cached, with
 * no indication that it had stopped updating. Network-level errors
 * (`unavailable`) are expected offline and must stay quiet, since the cached
 * data is still correct and the OfflineBanner already says so.
 */

import { toast } from "@/lib/toast";

type FirestoreLikeError = { code?: string; message?: string };

const AUTH_ERROR_CODES = new Set([
  "permission-denied",
  "unauthenticated",
]);

/** Errors that simply mean "offline" — the cache is still serving good data. */
const TRANSIENT_ERROR_CODES = new Set([
  "unavailable",
  "deadline-exceeded",
  "cancelled",
]);

/** Throttles the session-expired toast so seven listeners raise one message. */
let lastAuthNoticeAt = Number.NEGATIVE_INFINITY;
const AUTH_NOTICE_INTERVAL_MS = 10_000;

export function isAuthError(error: unknown): boolean {
  const code = (error as FirestoreLikeError | null)?.code;
  return typeof code === "string" && AUTH_ERROR_CODES.has(code);
}

export function isTransientNetworkError(error: unknown): boolean {
  const code = (error as FirestoreLikeError | null)?.code;
  return typeof code === "string" && TRANSIENT_ERROR_CODES.has(code);
}

/** Test seam — resets the throttle between cases. */
export function resetSnapshotErrorNotices(): void {
  lastAuthNoticeAt = Number.NEGATIVE_INFINITY;
}

/**
 * Handles a snapshot listener error: silent for offline blips, one visible
 * notice when the session can no longer read, logged otherwise.
 */
export function handleSnapshotError(
  label: string,
  error: unknown,
  now: number = Date.now()
): void {
  if (isTransientNetworkError(error)) return;

  if (isAuthError(error)) {
    console.error(`${label} snapshot error (auth):`, error);
    if (now - lastAuthNoticeAt >= AUTH_NOTICE_INTERVAL_MS) {
      lastAuthNoticeAt = now;
      toast.error("Your session expired. Sign in again to keep syncing.");
    }
    return;
  }

  console.error(`${label} snapshot error:`, error);
}
