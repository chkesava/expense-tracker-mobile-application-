import { afterEach, describe, expect, it, vi } from "vitest";

import {
  currentReauthMethod,
  freshIdToken,
  reauthFailureMessage,
  reauthMethodFor,
  reauthenticate,
  REAUTH_SIGN_OUT_INSTRUCTION,
  setReauthAdapterForTests,
  type ReauthAdapter,
} from "@/lib/reauthenticate";

function adapter(overrides: Partial<ReauthAdapter> = {}): ReauthAdapter {
  return {
    currentUser: () => ({ email: "a@b.c", providerIds: ["password"] }),
    withPassword: async () => {},
    withGoogle: async () => "ok",
    freshIdToken: async () => "token",
    ...overrides,
  };
}

function authError(code: string) {
  return Object.assign(new Error(code), { code });
}

afterEach(() => {
  setReauthAdapterForTests(null);
});

describe("reauthMethodFor", () => {
  it("picks password", () => {
    expect(reauthMethodFor(["password"])).toBe("password");
  });

  it("prefers password over google when the account has both", () => {
    // Typing a password beats a full OAuth round trip, and either satisfies it.
    expect(reauthMethodFor(["google.com", "password"])).toBe("password");
  });

  it("picks google", () => {
    expect(reauthMethodFor(["google.com"])).toBe("google");
  });

  it("picks phone", () => {
    expect(reauthMethodFor(["phone"])).toBe("phone");
  });

  it("reports none for an unknown or empty provider list", () => {
    expect(reauthMethodFor([])).toBe("none");
    expect(reauthMethodFor(["apple.com"])).toBe("none");
  });
});

describe("reauthFailureMessage", () => {
  it.each([["auth/wrong-password"], ["auth/invalid-credential"]])(
    "treats %s as a wrong password",
    (code) => {
      expect(reauthFailureMessage(code).reason).toBe("wrong-password");
    },
  );

  it.each([
    ["auth/popup-closed-by-user"],
    ["auth/cancelled-popup-request"],
    ["auth/user-cancelled"],
  ])("treats %s as a cancellation", (code) => {
    expect(reauthFailureMessage(code).reason).toBe("cancelled");
  });

  it("does not tell someone confirming who they are to confirm who they are", () => {
    const { message } = reauthFailureMessage("auth/requires-recent-login");
    expect(message).toContain("Sign out");
    expect(message.toLowerCase()).not.toContain("recent login");
  });

  it("names the rate limit rather than blaming the password", () => {
    const { reason, message } = reauthFailureMessage("auth/too-many-requests");
    expect(reason).toBe("failed");
    expect(message).toMatch(/wait/i);
  });

  it("falls back for an unknown or missing code", () => {
    expect(reauthFailureMessage("auth/something-new").reason).toBe("failed");
    expect(reauthFailureMessage(undefined).reason).toBe("failed");
  });

  it("never returns an empty message", () => {
    for (const code of [
      "auth/wrong-password",
      "auth/too-many-requests",
      "auth/user-mismatch",
      "auth/network-request-failed",
      undefined,
    ]) {
      expect(reauthFailureMessage(code).message.length).toBeGreaterThan(0);
    }
  });
});

describe("currentReauthMethod", () => {
  it("reads the signed-in account's providers", async () => {
    setReauthAdapterForTests(
      adapter({
        currentUser: () => ({ email: null, providerIds: ["google.com"] }),
      }),
    );
    await expect(currentReauthMethod()).resolves.toBe("google");
  });

  it("reports none when nobody is signed in", async () => {
    setReauthAdapterForTests(adapter({ currentUser: () => null }));
    await expect(currentReauthMethod()).resolves.toBe("none");
  });
});

describe("reauthenticate — password", () => {
  it("passes the signed-in email, not one supplied by the caller", async () => {
    const withPassword = vi.fn(async () => {});
    setReauthAdapterForTests(adapter({ withPassword }));

    await expect(
      reauthenticate({ method: "password", password: "hunter2" }),
    ).resolves.toEqual({ ok: true });
    expect(withPassword).toHaveBeenCalledWith("a@b.c", "hunter2");
  });

  it("rejects an empty password without calling Firebase", async () => {
    const withPassword = vi.fn(async () => {});
    setReauthAdapterForTests(adapter({ withPassword }));

    const result = await reauthenticate({ method: "password", password: "" });
    expect(result).toMatchObject({ ok: false, reason: "wrong-password" });
    expect(withPassword).not.toHaveBeenCalled();
  });

  it("maps a wrong password to something actionable", async () => {
    setReauthAdapterForTests(
      adapter({
        withPassword: async () => {
          throw authError("auth/wrong-password");
        },
      }),
    );
    await expect(
      reauthenticate({ method: "password", password: "nope" }),
    ).resolves.toMatchObject({ ok: false, reason: "wrong-password" });
  });

  it("falls back to sign-out when a password account has no email", async () => {
    // Possible after an email change that left the provider attached.
    setReauthAdapterForTests(
      adapter({
        currentUser: () => ({ email: null, providerIds: ["password"] }),
      }),
    );
    await expect(
      reauthenticate({ method: "password", password: "x" }),
    ).resolves.toMatchObject({
      ok: false,
      reason: "unsupported",
      message: REAUTH_SIGN_OUT_INSTRUCTION,
    });
  });
});

describe("reauthenticate — google", () => {
  it("succeeds", async () => {
    setReauthAdapterForTests(adapter({ withGoogle: async () => "ok" }));
    await expect(reauthenticate({ method: "google" })).resolves.toEqual({
      ok: true,
    });
  });

  it("reports a cancellation as cancelled, not a failure", async () => {
    // Backing out of the Google sheet is not an error worth alarming about.
    setReauthAdapterForTests(adapter({ withGoogle: async () => "cancelled" }));
    await expect(reauthenticate({ method: "google" })).resolves.toMatchObject({
      ok: false,
      reason: "cancelled",
    });
  });

  it("maps a thrown popup cancellation too", async () => {
    setReauthAdapterForTests(
      adapter({
        withGoogle: async () => {
          throw authError("auth/popup-closed-by-user");
        },
      }),
    );
    await expect(reauthenticate({ method: "google" })).resolves.toMatchObject({
      ok: false,
      reason: "cancelled",
    });
  });

  it("never reports success when the provider throws", async () => {
    setReauthAdapterForTests(
      adapter({
        withGoogle: async () => {
          throw new Error("no code on this one");
        },
      }),
    );
    await expect(reauthenticate({ method: "google" })).resolves.toMatchObject({
      ok: false,
      reason: "failed",
    });
  });
});

describe("reauthenticate — the paths that cannot re-auth", () => {
  it.each([["phone"], ["none"]] as const)(
    "tells a %s account to sign out and back in",
    async (method) => {
      setReauthAdapterForTests(
        adapter({
          currentUser: () => ({ email: null, providerIds: ["phone"] }),
        }),
      );
      const result = await reauthenticate({ method });
      expect(result).toMatchObject({
        ok: false,
        reason: "unsupported",
        message: REAUTH_SIGN_OUT_INSTRUCTION,
      });
    },
  );

  it("does not attempt a credential for a phone account", async () => {
    const withPassword = vi.fn(async () => {});
    const withGoogle = vi.fn(async () => "ok" as const);
    setReauthAdapterForTests(
      adapter({
        currentUser: () => ({ email: "a@b.c", providerIds: ["phone"] }),
        withPassword,
        withGoogle,
      }),
    );
    await reauthenticate({ method: "phone" });
    expect(withPassword).not.toHaveBeenCalled();
    expect(withGoogle).not.toHaveBeenCalled();
  });

  it("fails when nobody is signed in", async () => {
    setReauthAdapterForTests(adapter({ currentUser: () => null }));
    await expect(
      reauthenticate({ method: "password", password: "x" }),
    ).resolves.toMatchObject({ ok: false, reason: "failed" });
  });
});

describe("freshIdToken", () => {
  it("returns the token the adapter mints", async () => {
    const freshToken = vi.fn(async () => "new-token");
    setReauthAdapterForTests(adapter({ freshIdToken: freshToken }));
    await expect(freshIdToken()).resolves.toBe("new-token");
    // Must be a forced refresh: the cached token still carries the old
    // auth_time, and the server reads that.
    expect(freshToken).toHaveBeenCalled();
  });
});
