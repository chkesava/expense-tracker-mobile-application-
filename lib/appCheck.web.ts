import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";
import type { FirebaseApp } from "firebase/app";

import { env } from "./env";
import { logWarning } from "./errors";

let started = false;

/**
 * Web-only App Check. Call after `initializeApp` and before Auth/Firestore.
 * No-ops when the reCAPTCHA Enterprise site key is unset so existing builds
 * keep working until the leftover console + env work lands.
 */
export function initializeFirebaseAppCheck(app: FirebaseApp): void {
  if (started) return;
  const siteKey = env.firebase.appCheckRecaptchaKey;
  if (!siteKey) return;

  if (__DEV__) {
    const debug = env.firebase.appCheckDebugToken;
    if (debug) {
      const globalWithDebug = globalThis as {
        FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
      };
      globalWithDebug.FIREBASE_APPCHECK_DEBUG_TOKEN =
        debug === "true" ? true : debug;
    }
  }

  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    started = true;
  } catch (error) {
    logWarning("firebase.appCheck", error);
  }
}
