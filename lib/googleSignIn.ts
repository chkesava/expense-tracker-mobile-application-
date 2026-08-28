/**
 * Fallback for TypeScript resolution (Metro picks .native / .web at runtime).
 * Defaults to the native path used by Expo Go / Android / iOS, matching
 * lib/createAuth.ts's pattern.
 */
export type { GoogleSignInOutcome } from "./googleSignIn.native";
export { signInWithGoogle, describeGoogleSignInError } from "./googleSignIn.native";
