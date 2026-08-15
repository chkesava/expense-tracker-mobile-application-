import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  fetchWithTimeout,
  isAbortError,
} from "./fetchWithTimeout";

// ── helpers ──────────────────────────────────────────────────────────────────

function okResponse(body = "{}") {
  return new Response(body, { status: 200 });
}

/**
 * Creates a fetch mock that actually rejects with an AbortError when the
 * signal it receives is aborted — mirroring the behaviour of the real fetch.
 */
function abortAwareFetchMock() {
  return vi.fn().mockImplementation(
    (_url: string, init?: RequestInit): Promise<Response> => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (signal?.aborted) {
          const err = new Error("The user aborted a request.");
          err.name = "AbortError";
          reject(err);
          return;
        }
        signal?.addEventListener("abort", () => {
          const err = new Error("The user aborted a request.");
          err.name = "AbortError";
          reject(err);
        });
        // Never resolves on its own — timeout or abort must trigger it.
      });
    }
  );
}

// ── isAbortError ──────────────────────────────────────────────────────────────

describe("isAbortError", () => {
  it("returns true for AbortError", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(isAbortError(err)).toBe(true);
  });

  it("returns true for TimeoutError", () => {
    const err = new Error("timeout");
    err.name = "TimeoutError";
    expect(isAbortError(err)).toBe(true);
  });

  it("returns false for ordinary errors", () => {
    expect(isAbortError(new Error("network failure"))).toBe(false);
    expect(isAbortError("string")).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});

// ── fetchWithTimeout ──────────────────────────────────────────────────────────

describe("fetchWithTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("resolves with the response when the server replies in time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okResponse('{"ok":true}'))
    );

    const response = await fetchWithTimeout("https://api.example.com/data");
    expect(response.status).toBe(200);
  });

  it("respects the default timeout constant of 8 seconds", () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(8000);
  });

  it("aborts with AbortError when the internal timer fires", async () => {
    vi.stubGlobal("fetch", abortAwareFetchMock());

    // Start the fetch (do NOT await yet — the promise will be pending until we fire the timer).
    const resultPromise = fetchWithTimeout("https://api.example.com/data", {
      timeoutMs: 3000,
    });

    // Attach a no-op catch immediately to prevent Node from treating the abort
    // rejection (fired synchronously inside fake timers) as unhandled.
    const safeResult = resultPromise.catch((e) => e);

    // Advance fake timers past the 3-second mark to fire the internal AbortController.
    await vi.advanceTimersByTimeAsync(3001);

    // safeResult resolves with the error — verify it's an AbortError.
    const err = await safeResult;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe("AbortError");
  }, 10_000);

  it("aborts immediately when an already-aborted upstream signal is provided", async () => {
    vi.stubGlobal("fetch", abortAwareFetchMock());

    const controller = new AbortController();
    controller.abort();

    const resultPromise = fetchWithTimeout("https://api.example.com/data", {
      signal: controller.signal,
    });

    await expect(resultPromise).rejects.toSatisfy(
      (err: unknown) => err instanceof Error && err.name === "AbortError"
    );
  });

  it("aborts when the upstream signal fires mid-request", async () => {
    vi.stubGlobal("fetch", abortAwareFetchMock());

    const controller = new AbortController();
    const resultPromise = fetchWithTimeout("https://api.example.com/data", {
      signal: controller.signal,
      timeoutMs: 10_000,
    });

    // Attach a safe catch to absorb the rejection before Node sees it as unhandled.
    const safeResult = resultPromise.catch((e) => e);

    // Fire the upstream abort, then flush microtasks.
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    const err = await safeResult;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe("AbortError");
  }, 10_000);

  it("clears the internal timer (no leak) when the fetch resolves successfully", async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse()));

    await fetchWithTimeout("https://api.example.com/data", { timeoutMs: 5000 });

    // The `finally` block must call clearTimeout to cancel the pending timer.
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
