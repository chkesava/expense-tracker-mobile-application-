/**
 * Native Google Sign-In (Android/iOS): @react-native-google-signin/google-signin.
 * Logic moved verbatim out of app/(auth)/login.tsx and app/(ganesh-auth)/login.tsx
 * (no behavior change) so both screens can share one platform-resolved call.
 */

export type GoogleSignInOutcome =
  | { status: "cancelled" }
  | { status: "id-token"; idToken: string }
  // Web's signInWithPopup establishes the Firebase session directly — never
  // produced on native, but part of the shared type so both login screens
  // can branch on one outcome shape regardless of platform.
  | { status: "signed-in" };

export async function signInWithGoogle(): Promise<GoogleSignInOutcome> {
  const { GoogleSignin, isSuccessResponse } = await import(
    "@react-native-google-signin/google-signin"
  );

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();

  if (!isSuccessResponse(result)) return { status: "cancelled" };

  const idToken = result.data.idToken;
  if (!idToken) {
    throw new Error("Google did not return an ID token. Check that the Web client ID is configured.");
  }

  return { status: "id-token", idToken };
}

/**
 * Returns a user-facing message for a recognized Google-specific error,
 * `"cancelled"` when the toast should be suppressed entirely (user
 * cancelled), or `undefined` when the error isn't a recognized
 * GoogleSignin error (caller falls back to a generic message).
 */
export async function describeGoogleSignInError(error: unknown): Promise<string | "cancelled" | undefined> {
  try {
    const { isErrorWithCode, statusCodes } = await import(
      "@react-native-google-signin/google-signin"
    );
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return "cancelled";
      if (error.code === statusCodes.IN_PROGRESS) return "Google sign-in is already in progress.";
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return "Google Play Services is not available on this device.";
      }
      if (String(error.code) === "10") {
        return "Google Sign-In configuration error. Add the release signing SHA-1 in Firebase.";
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}
