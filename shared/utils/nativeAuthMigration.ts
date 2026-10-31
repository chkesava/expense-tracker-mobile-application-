/**
 * SPENDLY-636 — moving native builds from the Firebase JS SDK to the native
 * SDK cannot carry the signed-in session across (the JS SDK's session is not
 * transferable). The owner chose a one-time re-sign-in with a short
 * explanation over a token-bridge server (decided 2026-10-30).
 *
 * This decides, from what is on the device, whether to show that
 * explanation and whether the leftover JS-SDK session record can be removed.
 * Nothing is lost by signing in again: the write outbox is kept per user and
 * replays on that user's next sign-in (`replayWriteOutbox`).
 */

/** Where the Firebase JS SDK (React Native persistence) keeps its session. */
export function legacyAuthSessionKey(apiKey: string, appName = "[DEFAULT]"): string {
  return `firebase:authUser:${apiKey}:${appName}`;
}

export interface NativeAuthMigrationInput {
  /** Native SDK is the auth path on this build (SPENDLY-638 turns this on). */
  nativeAuthEnabled: boolean;
  /** The native SDK already has a signed-in user. */
  nativeUserPresent: boolean;
  /** A JS-SDK session record is still on the device. */
  legacySessionPresent: boolean;
  /** The user already dismissed the explanation on this device. */
  noticeDismissed: boolean;
}

export interface NativeAuthMigrationDecision {
  showReSignInNotice: boolean;
  /** The JS-SDK session record is no longer needed and can be deleted. */
  clearLegacySession: boolean;
}

export function nativeAuthMigrationDecision(input: NativeAuthMigrationInput): NativeAuthMigrationDecision {
  if (!input.nativeAuthEnabled || !input.legacySessionPresent) {
    return { showReSignInNotice: false, clearLegacySession: false };
  }
  // Signed in again on the native SDK: the old record has done its job.
  if (input.nativeUserPresent) {
    return { showReSignInNotice: false, clearLegacySession: true };
  }
  if (input.noticeDismissed) {
    return { showReSignInNotice: false, clearLegacySession: true };
  }
  return { showReSignInNotice: true, clearLegacySession: false };
}

export const RE_SIGN_IN_NOTICE = {
  title: "Please sign in once more",
  body:
    "Spendly now keeps your data on this device so it opens faster and works offline. " +
    "This one-time update needs you to sign in again. Anything you saved while offline " +
    "is kept and syncs after you sign in.",
} as const;
