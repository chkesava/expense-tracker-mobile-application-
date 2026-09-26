/**
 * Environment configuration for Expo.
 * Maps former Vite `VITE_*` keys to `EXPO_PUBLIC_*`.
 * Server-only secrets (TWELVE_DATA, CRON, service account) must NEVER be listed here.
 *
 * IMPORTANT: Expo/Metro only inlines *static* `process.env.EXPO_PUBLIC_*` access.
 * Dynamic `process.env[key]` stays empty in release APKs.
 */

function trimEnv(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export const env = {
  /** Public app origin for payment share links (ex-VITE_PUBLIC_APP_URL). */
  publicAppUrl: trimEnv(process.env.EXPO_PUBLIC_APP_URL),
  /**
   * Origin hosting the public share pages. Separate from `publicAppUrl`, which
   * still addresses the `/api/*` market functions and the Google auth bridge.
   * Empty means "fall back to publicAppUrl" — see `getPublicAppOrigin`.
   */
  shareUrl: trimEnv(process.env.EXPO_PUBLIC_SHARE_URL),

  /** Google OAuth Web client ID (Firebase Console → Auth → Google). */
  googleWebClientId: trimEnv(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),

  firebase: {
    apiKey: trimEnv(process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
    authDomain: trimEnv(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: trimEnv(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: trimEnv(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: trimEnv(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER),
    appId: trimEnv(process.env.EXPO_PUBLIC_FIREBASE_APP_ID),
    /** reCAPTCHA Enterprise site key. Empty = App Check stays off (web). */
    appCheckRecaptchaKey: trimEnv(
      process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_KEY
    ),
    /** `__DEV__` only. `true` mints a debug token; otherwise a console token. */
    appCheckDebugToken: trimEnv(
      process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN
    ),
  },

  supabase: {
    url: trimEnv(process.env.EXPO_PUBLIC_SUPABASE_URL),
    publishableKey: trimEnv(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  },

  /**
   * Optional Sentry DSN. Empty = crash reporting stays off.
   * Unused until an SDK is wired; keep the key static so Metro can inline it.
   */
  sentryDsn: trimEnv(process.env.EXPO_PUBLIC_SENTRY_DSN),

  /**
   * SPENDLY-175: host of the Firebase Local Emulator Suite. Set only for local
   * test builds (`npm run android:test-build` or a gitignored `.env.local`);
   * the release workflow refuses to build with it. When set, the app talks to
   * a `demo-` project on the emulator and never to production Firebase.
   */
  firebaseEmulatorHost: trimEnv(process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST),
} as const;

/** Project the emulator serves. `demo-` projects never exist in Google's cloud. */
export const LOCAL_TEST_PROJECT_ID = "demo-spendly";

/** Emulator ports; keep in step with `emulators` in firebase.json. */
export const FIREBASE_EMULATOR_PORTS = {
  auth: 9099,
  firestore: 8080,
  storage: 9199,
} as const;

/**
 * True in a local test build: Firebase goes to the emulator, and every other
 * backend (Netlify, Supabase, market data) is blocked by `lib/networkGuard`.
 */
export function isLocalTestMode(): boolean {
  return env.firebaseEmulatorHost !== "";
}

export function isSupabaseEnvConfigured(): boolean {
  // Test builds never reach Supabase (SPENDLY-175).
  if (isLocalTestMode()) return false;
  return Boolean(env.supabase.url && env.supabase.publishableKey);
}

export function isFirebaseEnvConfigured(): boolean {
  // The emulator needs no production keys; lib/firebase uses a demo config.
  if (isLocalTestMode()) return true;
  const f = env.firebase;
  return Boolean(
    f.apiKey &&
      f.authDomain &&
      f.projectId &&
      f.storageBucket &&
      f.messagingSenderId &&
      f.appId
  );
}
