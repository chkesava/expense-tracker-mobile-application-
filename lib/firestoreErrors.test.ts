import { afterEach, describe, expect, it, vi } from "vitest";

import { snapshotErrorHandler, toLoadFailure } from "./firestoreErrors";

function firestoreError(code: string) {
  const error = new Error(`Firebase: Error (${code}).`) as Error & { code: string };
  error.code = code;
  error.name = "FirebaseError";
  return error;
}

describe("toLoadFailure", () => {
  it("produces a renderable message, never the SDK string", () => {
    const failure = toLoadFailure(firestoreError("permission-denied"), "fallback");
    expect(failure.message).not.toMatch(/firebase/i);
    expect(failure.kind).toBe("permission");
  });

  it("marks transport failures retryable", () => {
    expect(toLoadFailure(firestoreError("unavailable"), "f").retryable).toBe(true);
    expect(toLoadFailure(new Error("Network request failed"), "f").retryable).toBe(
      true
    );
  });

  it("marks permission and auth failures non-retryable", () => {
    // Retrying these fails identically until the user re-authenticates.
    expect(toLoadFailure(firestoreError("permission-denied"), "f").retryable).toBe(
      false
    );
    expect(toLoadFailure(firestoreError("unauthenticated"), "f").retryable).toBe(
      false
    );
    expect(toLoadFailure(firestoreError("not-found"), "f").retryable).toBe(false);
  });

  it("uses the caller's fallback for unrecognised errors", () => {
    expect(toLoadFailure(new Error(""), "Couldn't load your vaults.").message).toBe(
      "Couldn't load your vaults."
    );
  });
});

describe("snapshotErrorHandler", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports the failure to the caller instead of swallowing it", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const onFail = vi.fn();
    snapshotErrorHandler("snapshot.vaults", onFail, "Couldn't load your vaults.")(
      firestoreError("unavailable")
    );

    expect(onFail).toHaveBeenCalledTimes(1);
    const failure = onFail.mock.calls[0][0];
    expect(failure.kind).toBe("network");
    expect(failure.retryable).toBe(true);
  });

  it("logs through the redacting logger", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    snapshotErrorHandler("snapshot.userDoc", () => undefined)(
      new Error("read failed for user@example.com")
    );
    const serialized = JSON.stringify(spy.mock.calls[0]);
    expect(serialized).toContain("snapshot.userDoc");
    expect(serialized).not.toContain("user@example.com");
  });
});
