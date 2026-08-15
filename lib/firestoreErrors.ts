/**
 * Shared handling for Firestore `onSnapshot` failures.
 *
 * Every listener in the app used to pass an error callback that did nothing but
 * `console.warn` and `setLoading(false)`. The result was indistinguishable from
 * success-with-no-rows: a `permission-denied` or a listener that could not be
 * established rendered the "Nothing here yet" empty state, with no error and no
 * way to retry.
 *
 * `LoadFailure` carries the user-facing message plus enough classification for
 * a screen to decide between "retry" and "sign in again".
 */

import { classifyError, friendlyErrorMessage, logWarning, type ErrorKind } from "./errors";

export type LoadFailure = {
  /** Safe to render directly. */
  message: string;
  kind: ErrorKind;
  /** False for permission/auth failures, which will fail the same way again. */
  retryable: boolean;
};

export function toLoadFailure(error: unknown, fallback: string): LoadFailure {
  const kind = classifyError(error);
  return {
    message: friendlyErrorMessage(error, fallback),
    kind,
    retryable: kind !== "permission" && kind !== "auth" && kind !== "notFound",
  };
}

/**
 * Builds an `onSnapshot` error callback that logs (redacted) and hands the
 * screen a renderable failure.
 *
 * @param scope   stable log identifier, e.g. `"snapshot.vaults"`
 * @param onFail  receives the failure; typically a `setError` setter
 * @param fallback copy used when the error carries no recognisable code
 */
export function snapshotErrorHandler(
  scope: string,
  onFail: (failure: LoadFailure) => void,
  fallback = "Couldn't load your data. Pull to refresh or try again."
): (error: unknown) => void {
  return (error: unknown) => {
    logWarning(scope, error);
    onFail(toLoadFailure(error, fallback));
  };
}
