import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The late-failure hook is the only notice a caller gets (GS-069, GS-030).
 *
 * `commitWrite` resolves as `"queued"` once the ack grace window elapses, and
 * a failure arriving after that point never rejects — it goes to
 * `onLateFailure`. Everything that has to clean up after a write it already
 * reported as saved depends on that, and the contract has a sharp edge:
 * supplying `onLateFailure` *replaces* the default reporter rather than adding
 * to it, so a caller that forgets to report leaves the user believing the
 * write landed.
 */

const toastError = vi.fn();
const logged: Array<{ scope: string; label?: string }> = [];

vi.mock("@/lib/toast", () => ({
  toast: { error: (message: string) => toastError(message), success: vi.fn() },
}));

vi.mock("@/lib/errors", () => ({
  logError: (scope: string, _error: unknown, context?: { label?: string }) => {
    logged.push({ scope, label: context?.label });
  },
  friendlyErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

import { commitWrite, reportLateWriteFailure, SERVER_ACK_GRACE_MS } from "./firestoreWrite";

beforeEach(() => {
  toastError.mockClear();
  logged.length = 0;
});

describe("commitWrite late failures", () => {
  it("routes a post-grace failure to onLateFailure instead of rejecting", async () => {
    const late = vi.fn();
    let reject: (error: unknown) => void = () => undefined;

    const outcome = await commitWrite(
      () => new Promise((_resolve, r) => {
        reject = r;
      }),
      { graceMs: 1, label: "expense receipt", onLateFailure: late }
    );

    // The caller has already been told the write is safe.
    expect(outcome).toBe("queued");
    expect(late).not.toHaveBeenCalled();

    const boom = new Error("permission-denied");
    reject(boom);
    await new Promise((r) => setTimeout(r, 0));

    expect(late).toHaveBeenCalledWith(boom);
  });

  it("does not report the failure itself once a caller supplies onLateFailure", async () => {
    // This is the edge the storage cleanup has to compensate for: overriding
    // the hook silences the toast, so a caller that only cleans up leaves the
    // user with no notice at all.
    const late = vi.fn();
    let reject: (error: unknown) => void = () => undefined;

    await commitWrite(
      () => new Promise((_resolve, r) => {
        reject = r;
      }),
      { graceMs: 1, label: "asset photo", onLateFailure: late }
    );
    reject(new Error("unavailable"));
    await new Promise((r) => setTimeout(r, 0));

    expect(toastError).not.toHaveBeenCalled();
  });

  it("still reports when no hook is supplied", async () => {
    let reject: (error: unknown) => void = () => undefined;

    await commitWrite(
      () => new Promise((_resolve, r) => {
        reject = r;
      }),
      { graceMs: 1, label: "expense" }
    );
    reject(new Error("unavailable"));
    await new Promise((r) => setTimeout(r, 0));

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0]?.[0]).toContain("Your expense was not saved after all");
  });

  it("keeps rejecting a failure that arrives before the grace window", async () => {
    // Existing try/catch paths - including the storage orphan cleanup for an
    // early failure - depend on this staying a rejection.
    const late = vi.fn();

    await expect(
      commitWrite(() => Promise.reject(new Error("invalid-argument")), {
        graceMs: 5_000,
        onLateFailure: late,
      })
    ).rejects.toThrow("invalid-argument");
    expect(late).not.toHaveBeenCalled();
  });

  it("exposes the default reporter so an overriding caller can still notify", async () => {
    reportLateWriteFailure(new Error("nope"), "sponsor photo");

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0]?.[0]).toContain("Your sponsor photo was not saved after all");
    expect(logged).toEqual([{ scope: "firestoreWrite.lateFailure", label: "sponsor photo" }]);
  });

  it("keeps the documented grace window", () => {
    // The storage cleanup's correctness argument rests on this being a short
    // window rather than an indefinite wait.
    expect(SERVER_ACK_GRACE_MS).toBe(1500);
  });
});
