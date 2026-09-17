import type { FirebaseApp } from "firebase/app";

/**
 * Native App Check (Play Integrity) needs `@react-native-firebase/app-check`.
 * This JS-SDK app cannot mint those tokens. Do not enforce App Check in the
 * Firebase console until Android clients send them (SPENDLY-10 leftover).
 */
export function initializeFirebaseAppCheck(_app: FirebaseApp): void {
  // no-op on iOS / Android
}
