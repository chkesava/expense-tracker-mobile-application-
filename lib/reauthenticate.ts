/**
 * Re-presenting a credential before a destructive action — SPENDLY-7 (AUTH-06).
 *
 * Firebase requires a recent login before `deleteUser`, and account deletion is
 * the action this exists for. Nothing in the app did this before: a session
 * stays valid indefinitely, so "are you still the person who signed in?" had no
 * answer.
 *
 * ## This is a UX affordance, not the enforcement point
 *
 * A tampered client can skip every prompt here. What actually gates deletion is
 * the server: `netlify/functions/delete-account.ts` reads `auth_time` out of the
 * verified ID token and refuses anything older than
 * `REAUTH_MAX_AGE_SEC`. `auth_time` is stamped by Firebase when a credential is
 * presented and is not client-controllable.
 *
 * So the contract is: call {@link reauthenticate}, and on success call
 * {@link freshIdToken} to mint a token carrying the new `auth_time`. Skipping
 * the first step just means the server says no.
 */

import { errorCode } from "./errors";

export type ReauthMethod = "password" | "google" | "phone" | "none";

export type ReauthFailureReason =
  | "cancelled"
  | "wrong-password"
  | "unsupported"
  | "failed";

export type ReauthResult =
  | { ok: true }
  | { ok: false; reason: ReauthFailureReason; message: string };

/**
 * What this account can re-present.
 *
 * `password` wins when the account has one, even alongside Google: typing a
 * password is cheaper than a full OAuth round trip, and an account with both
 * can satisfy either.
 *
 * Pure — takes provider ids, not a `User`, so it is testable without the SDK.
 */
export function reauthMethodFor(
  providerIds: readonly string[],
): ReauthMethod {
  if (providerIds.includes("password")) return "password";
  if (providerIds.includes("google.com")) return "google";
  if (providerIds.includes("phone")) return "phone";
  return "none";
}

/**
 * Why re-auth failed, in words a person can act on.
 *
 * Kept separate from {@link reauthenticate} so every branch is provable without
 * standing up Firebase Auth.
 */
export function reauthFailureMessage(code: string | undefined): {
  reason: ReauthFailureReason;
  message: string;
} {
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return {
        reason: "wrong-password",
        message: "That password is not right. Try again.",
      };
    case "auth/missing-password":
      return { reason: "wrong-password", message: "Enter your password." };
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/user-cancelled":
      return { reason: "cancelled", message: "Cancelled." };
    case "auth/too-many-requests":
      return {
        reason: "failed",
        message: "Too many attempts. Wait a few minutes and try again.",
      };
    case "auth/user-mismatch":
      return {
        reason: "failed",
        message: "That account is not the one you are signed in as.",
      };
    case "auth/network-request-failed":
      return {
        reason: "failed",
        message: "No connection. Check your network and try again.",
      };
    case "auth/user-token-expired":
    case "auth/requires-recent-login":
      // Asking someone to confirm who they are, and being told they need to
      // confirm who they are, helps nobody.
      return {
        reason: "failed",
        message: "Your session expired. Sign out, sign back in, and try again.",
      };
    default:
      return {
        reason: "failed",
        message: "Could not confirm it is you. Try again.",
      };
  }
}

/** What a phone or provider-less account is told instead. */
export const REAUTH_SIGN_OUT_INSTRUCTION =
  "Sign out, sign back in, then come back here.";

/**
 * The Firebase calls, behind a seam.
 *
 * The SDK cannot be driven from vitest — no auth emulator in `npm run test`,
 * and `firebase/auth` pulls in React Native. Tests swap this out, in the same
 * spirit as `setPinVaultStorageForTests` in `lib/pinVault.ts`, so the
 * orchestration below is covered rather than just the pure helpers.
 */
export type ReauthAdapter = {
  currentUser(): {
    email: string | null;
    providerIds: readonly string[];
  } | null;
  withPassword(email: string, password: string): Promise<void>;
  withGoogle(): Promise<"ok" | "cancelled">;
  freshIdToken(): Promise<string>;
};

let adapterOverride: ReauthAdapter | null = null;

/** Swap the Firebase calls. Tests only. */
export function setReauthAdapterForTests(next: ReauthAdapter | null): void {
  adapterOverride = next;
}

async function firebaseAdapter(): Promise<ReauthAdapter> {
  // All dynamic: this module is unit-tested, and a top-level `react-native` or
  // `firebase/auth` import makes it unloadable in vitest's node environment.
  const [{ getFirebaseAuth }, authModule, { Platform }] = await Promise.all([
    import("./firebase"),
    import("firebase/auth"),
    import("react-native"),
  ]);
  const {
    EmailAuthProvider,
    GoogleAuthProvider,
    reauthenticateWithCredential,
    reauthenticateWithPopup,
  } = authModule;

  const requireUser = () => {
    const user = getFirebaseAuth()?.currentUser;
    if (!user) throw new Error("Not signed in.");
    return user;
  };

  return {
    currentUser() {
      const user = getFirebaseAuth()?.currentUser;
      if (!user) return null;
      return {
        email: user.email,
        providerIds: user.providerData.map((p) => p.providerId),
      };
    },
    async withPassword(email, password) {
      const user = requireUser();
      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(email, password),
      );
    },
    async withGoogle() {
      const user = requireUser();
      if (Platform.OS === "web") {
        await reauthenticateWithPopup(user, new GoogleAuthProvider());
        return "ok";
      }
      // Native: reuse the same sign-in module the login screen uses, so there
      // is one Google integration rather than two.
      const { signInWithGoogle } = await import("./googleSignIn");
      const outcome = await signInWithGoogle();
      if (outcome.status === "cancelled") return "cancelled";
      if (outcome.status !== "id-token") {
        // `signed-in` is the web branch's shape and cannot happen here; treat
        // anything unexpected as a failure rather than a silent pass.
        throw new Error("Google did not return an ID token.");
      }
      await reauthenticateWithCredential(
        user,
        GoogleAuthProvider.credential(outcome.idToken),
      );
      return "ok";
    },
    async freshIdToken() {
      return requireUser().getIdToken(true);
    },
  };
}

async function adapter(): Promise<ReauthAdapter> {
  return adapterOverride ?? (await firebaseAdapter());
}

/** The method this account should be asked for, or `none`. */
export async function currentReauthMethod(): Promise<ReauthMethod> {
  const user = (await adapter()).currentUser();
  if (!user) return "none";
  return reauthMethodFor(user.providerIds);
}

/**
 * Re-present the credential.
 *
 * On `{ ok: true }` the account's `auth_time` is now, and {@link freshIdToken}
 * will mint a token the server accepts.
 */
export async function reauthenticate(input: {
  method: ReauthMethod;
  password?: string;
}): Promise<ReauthResult> {
  const store = await adapter();
  const user = store.currentUser();
  if (!user) {
    return { ok: false, reason: "failed", message: "You are not signed in." };
  }

  if (input.method === "phone" || input.method === "none") {
    // Re-auth for phone needs `verifyPhoneNumber` plus a recaptcha verifier
    // threaded through the OTP screen, for a path taken once by a handful of
    // people. A fresh sign-in sets `auth_time` just as well, so the honest
    // answer is to say so rather than build it.
    return {
      ok: false,
      reason: "unsupported",
      message: REAUTH_SIGN_OUT_INSTRUCTION,
    };
  }

  try {
    if (input.method === "password") {
      if (!user.email) {
        return {
          ok: false,
          reason: "unsupported",
          message: REAUTH_SIGN_OUT_INSTRUCTION,
        };
      }
      if (!input.password) {
        return {
          ok: false,
          reason: "wrong-password",
          message: "Enter your password.",
        };
      }
      await store.withPassword(user.email, input.password);
      return { ok: true };
    }

    const outcome = await store.withGoogle();
    if (outcome === "cancelled") {
      return { ok: false, reason: "cancelled", message: "Cancelled." };
    }
    return { ok: true };
  } catch (error) {
    const { reason, message } = reauthFailureMessage(errorCode(error));
    return { ok: false, reason, message };
  }
}

/**
 * A token carrying the `auth_time` the re-auth just set.
 *
 * Call only after {@link reauthenticate} resolves `ok` — the cached token still
 * has the old `auth_time`, and the server reads that, not the local clock.
 */
export async function freshIdToken(): Promise<string> {
  return (await adapter()).freshIdToken();
}
