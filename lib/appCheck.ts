import type { FirebaseApp } from "firebase/app";

import { isLocalTestMode } from "@/lib/env";
import { logWarning } from "@/lib/errors";

/**
 * Native App Check (Play Integrity) — SPENDLY-637.
 *
 * The JS-SDK app cannot mint native App Check tokens, so this was a no-op
 * (SPENDLY-10 leftover). With `@react-native-firebase/app-check` installed,
 * the native provider is wired here but stays **off**: tokens only matter
 * once the native SDK carries the requests (SPENDLY-638), and turning on
 * enforcement in the Firebase console is a separate decision. Do not enforce
 * App Check until Android clients send tokens.
 *
 * Spendly Test uses the debug provider (no Play Integrity on the emulator).
 */
export const NATIVE_APP_CHECK_ENABLED = false;

export function initializeFirebaseAppCheck(_app: FirebaseApp, enabled: boolean = NATIVE_APP_CHECK_ENABLED): void {
  if (!enabled) return;
  void (async () => {
    try {
      const [{ getApp }, { initializeAppCheck }] = await Promise.all([
        import("@react-native-firebase/app"),
        import("@react-native-firebase/app-check"),
      ]);
      await initializeAppCheck(getApp(), {
        provider: {
          providerOptions: {
            android: { provider: isLocalTestMode() ? "debug" : "playIntegrity" },
          },
        },
        isTokenAutoRefreshEnabled: true,
      });
    } catch (error) {
      logWarning("appCheck.native.init", error);
    }
  })();
}
