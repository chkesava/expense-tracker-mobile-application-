/**
 * `fetch` with a hard timeout and caller-driven cancellation.
 *
 * React Native's fetch has no default timeout: on a stalled connection the
 * promise can hang for minutes, leaving a spinner up with no way out. Every
 * outbound HTTP call in the app goes through here so a slow network fails fast
 * and predictably, and so an unmounted screen (or a superseded query) can abort
 * the request instead of paying for a response nobody will read.
 */

export const DEFAULT_REQUEST_TIMEOUT_MS = 8000;

export type FetchWithTimeoutOptions = RequestInit & {
  timeoutMs?: number;
  /** Upstream signal (e.g. React Query's) — aborting it aborts the request. */
  signal?: AbortSignal | null;
};

/** True when a rejection came from the timeout or from an upstream abort. */
export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, signal, ...init } = options;

  const controller = new AbortController();
  const abortFromUpstream = () => controller.abort();

  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", abortFromUpstream);
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromUpstream);
  }
}
