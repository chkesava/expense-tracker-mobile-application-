import { describe, expect, it } from "vitest";

import {
  legacyAuthSessionKey,
  nativeAuthMigrationDecision,
  type NativeAuthMigrationInput,
} from "@/shared/utils/nativeAuthMigration";

const base: NativeAuthMigrationInput = {
  nativeAuthEnabled: true,
  nativeUserPresent: false,
  legacySessionPresent: true,
  noticeDismissed: false,
};

describe("nativeAuthMigrationDecision (SPENDLY-636)", () => {
  it("does nothing while the native SDK is not the auth path", () => {
    expect(nativeAuthMigrationDecision({ ...base, nativeAuthEnabled: false })).toEqual({
      showReSignInNotice: false,
      clearLegacySession: false,
    });
  });

  it("does nothing for a fresh install (no old session)", () => {
    expect(nativeAuthMigrationDecision({ ...base, legacySessionPresent: false })).toEqual({
      showReSignInNotice: false,
      clearLegacySession: false,
    });
  });

  it("explains the one-time sign-in to someone who was signed in before the update", () => {
    expect(nativeAuthMigrationDecision(base)).toEqual({ showReSignInNotice: true, clearLegacySession: false });
  });

  it("drops the old record once they are signed in on the native SDK", () => {
    expect(nativeAuthMigrationDecision({ ...base, nativeUserPresent: true })).toEqual({
      showReSignInNotice: false,
      clearLegacySession: true,
    });
  });

  it("does not repeat the explanation after it is dismissed", () => {
    expect(nativeAuthMigrationDecision({ ...base, noticeDismissed: true })).toEqual({
      showReSignInNotice: false,
      clearLegacySession: true,
    });
  });
});

describe("legacyAuthSessionKey", () => {
  it("matches the Firebase JS SDK's persistence key for the default app", () => {
    expect(legacyAuthSessionKey("AIzaTest")).toBe("firebase:authUser:AIzaTest:[DEFAULT]");
  });
});
