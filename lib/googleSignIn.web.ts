/**
 * Web Google Sign-In: Firebase's own signInWithPopup, since
 * @react-native-google-signin/google-signin (used on native) has no web
 * target. Enforces the same admin "disable signups" gate as the native
 * ID-token path (see lib/googleSignupGate.ts) before reporting success.
 */
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";

import { getFirebaseAuth } from "@/lib/firebase";
import { enforceGoogleSignupGate } from "@/lib/googleSignupGate";

export type GoogleSignInOutcome =
  | { status: "cancelled" }
  | { status: "id-token"; idToken: string }
  | { status: "signed-in" };

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

export async function signInWithGoogle(): Promise<GoogleSignInOutcome> {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase Auth is not configured.");

  try {
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    await enforceGoogleSignupGate(result);
    return { status: "signed-in" };
  } catch (error) {
    const code = errorCode(error);
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      return { status: "cancelled" };
    }
    throw error;
  }
}

/**
 * Returns a user-facing message for a recognized Firebase Auth error, or
 * `undefined` when it isn't recognized (caller falls back to a generic
 * message). Cancellation is already handled inside signInWithGoogle, which
 * returns {status:"cancelled"} instead of throwing — so this never needs to
 * return "cancelled" itself.
 */
export async function describeGoogleSignInError(error: unknown): Promise<string | undefined> {
  const code = errorCode(error);
  if (code === "auth/popup-blocked") {
    return "Your browser blocked the sign-in pop-up. Please allow pop-ups for this site and try again.";
  }
  if (code === "auth/unauthorized-domain") {
    return "This domain is not authorized for Google sign-in yet.";
  }
  return undefined;
}
