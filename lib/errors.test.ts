import { afterEach, describe, expect, it, vi } from "vitest";

import {
  classifyError,
  errorCode,
  friendlyErrorMessage,
  isNetworkError,
  isPermissionError,
  logError,
  logWarning,
  safeErrorDetails,
} from "./errors";

/** Shape of a thrown FirebaseError as the SDK actually produces it. */
function firebaseError(code: string, message?: string) {
  const error = new Error(message ?? `Firebase: Error (${code}).`) as Error & {
    code: string;
    customData?: Record<string, unknown>;
  };
  error.code = code;
  error.name = "FirebaseError";
  return error;
}

describe("errorCode", () => {
  it("reads a string code", () => {
    expect(errorCode(firebaseError("auth/invalid-credential"))).toBe(
      "auth/invalid-credential"
    );
  });

  it("ignores non-object and non-string codes", () => {
    expect(errorCode("boom")).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
    expect(errorCode({ code: 42 })).toBeUndefined();
  });
});

describe("classifyError", () => {
  it.each([
    ["permission-denied", "permission"],
    ["unauthenticated", "auth"],
    ["auth/wrong-password", "auth"],
    ["auth/network-request-failed", "network"],
    ["unavailable", "network"],
    ["deadline-exceeded", "network"],
    ["not-found", "notFound"],
    ["invalid-argument", "validation"],
    ["already-exists", "conflict"],
    ["resource-exhausted", "rateLimit"],
  ])("maps %s to %s", (code, kind) => {
    expect(classifyError(firebaseError(code))).toBe(kind);
  });

  it("detects transport failures without a code", () => {
    expect(classifyError(new Error("Network request failed"))).toBe("network");
    const aborted = new Error("The operation was aborted");
    aborted.name = "AbortError";
    expect(classifyError(aborted)).toBe("network");
  });

  it("falls back to unknown", () => {
    expect(classifyError(new Error("something odd"))).toBe("unknown");
    expect(classifyError(undefined)).toBe("unknown");
  });

  it("exposes the network and permission predicates", () => {
    expect(isNetworkError(firebaseError("unavailable"))).toBe(true);
    expect(isNetworkError(firebaseError("permission-denied"))).toBe(false);
    expect(isPermissionError(firebaseError("permission-denied"))).toBe(true);
    expect(isPermissionError(firebaseError("auth/user-token-expired"))).toBe(true);
    expect(isPermissionError(new Error("nope"))).toBe(false);
  });
});

describe("friendlyErrorMessage", () => {
  it("never returns the raw Firebase string", () => {
    const message = friendlyErrorMessage(firebaseError("auth/invalid-credential"));
    expect(message).toBe("Incorrect email or password.");
    expect(message).not.toMatch(/firebase/i);
    expect(message).not.toMatch(/auth\//);
  });

  it("does not reveal whether an account exists", () => {
    expect(friendlyErrorMessage(firebaseError("auth/user-not-found"))).toBe(
      friendlyErrorMessage(firebaseError("auth/wrong-password"))
    );
  });

  it("maps Firestore status codes", () => {
    expect(friendlyErrorMessage(firebaseError("permission-denied"))).toMatch(
      /don't have access/i
    );
    expect(friendlyErrorMessage(firebaseError("unavailable"))).toMatch(
      /can't reach the server/i
    );
  });

  it("keeps messages we wrote ourselves", () => {
    expect(
      friendlyErrorMessage(new Error("Please enter your name"), "fallback")
    ).toBe("Please enter your name");
  });

  it("rejects technical-looking messages in favour of the fallback", () => {
    for (const raw of [
      "Firebase: Error (auth/weird-new-code).",
      "FirebaseError: Missing or insufficient permissions",
      "Request to https://api.example.com/v1/quote?token=abc failed",
      "TypeError: undefined is not an object\n    at foo (bundle.js:1:2)",
    ]) {
      const message = friendlyErrorMessage(new Error(raw), "Couldn't save.");
      expect(message).not.toContain(raw);
    }
  });

  it("truncated-free: very long messages fall back", () => {
    expect(friendlyErrorMessage(new Error("x".repeat(400)), "Couldn't save.")).toBe(
      "Couldn't save."
    );
  });

  it("uses the classification when a code is unmapped", () => {
    expect(friendlyErrorMessage(firebaseError("some-new-network-thing"))).toBe(
      "Something went wrong. Please try again."
    );
    const timeout = firebaseError("unavailable", "transport closed");
    expect(friendlyErrorMessage(timeout)).toMatch(/can't reach the server/i);
  });

  it("handles non-error values", () => {
    expect(friendlyErrorMessage(null, "fallback")).toBe("fallback");
    expect(friendlyErrorMessage("boom", "fallback")).toBe("fallback");
    expect(friendlyErrorMessage(undefined)).toBe(
      "Something went wrong. Please try again."
    );
  });
});

describe("safeErrorDetails", () => {
  it("redacts email addresses and querystring values", () => {
    const details = safeErrorDetails(
      new Error("failed for user@example.com via https://api.test/q?token=s3cret&id=99")
    );
    expect(details.message).not.toContain("user@example.com");
    expect(details.message).not.toContain("s3cret");
    expect(details.message).toContain("[redacted]");
  });

  it("drops Firebase customData entirely", () => {
    const error = firebaseError("auth/invalid-credential");
    (error as { customData?: unknown }).customData = {
      email: "victim@example.com",
      _tokenResponse: { idToken: "ya29.super-secret-token" },
    };
    const details = safeErrorDetails(error);
    expect(Object.keys(details)).toEqual(["name", "code", "message", "kind"]);
    expect(JSON.stringify(details)).not.toContain("victim@example.com");
    expect(JSON.stringify(details)).not.toContain("ya29");
  });

  it("keeps the code and name for triage", () => {
    const details = safeErrorDetails(firebaseError("permission-denied"));
    expect(details.code).toBe("permission-denied");
    expect(details.name).toBe("FirebaseError");
    expect(details.kind).toBe("permission");
  });
});

describe("logError / logWarning", () => {
  afterEach(() => vi.restoreAllMocks());

  it("redacts sensitive context keys", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logError("auth.login", firebaseError("auth/invalid-credential"), {
      email: "user@example.com",
      idToken: "ya29.secret",
      attempt: 2,
    });

    const serialized = JSON.stringify(spy.mock.calls[0]);
    expect(serialized).not.toContain("user@example.com");
    expect(serialized).not.toContain("ya29.secret");
    expect(serialized).toContain("auth.login");
    expect(serialized).toContain('"attempt":2');
  });

  it("collapses nested objects rather than serializing them", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logWarning("sync.push", new Error("nope"), {
      payload: { accountNumber: "1234567890" },
    });
    const serialized = JSON.stringify(spy.mock.calls[0]);
    expect(serialized).not.toContain("1234567890");
  });
});
