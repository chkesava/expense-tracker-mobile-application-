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

  /** Gemini API key for nutrition food analysis (same as web `VITE_GEMINI_API_KEY`). */
  geminiApiKey: trimEnv(process.env.EXPO_PUBLIC_GEMINI_API_KEY),

  firebase: {
    apiKey: trimEnv(process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
    authDomain: trimEnv(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: trimEnv(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: trimEnv(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: trimEnv(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER),
    appId: trimEnv(process.env.EXPO_PUBLIC_FIREBASE_APP_ID),
  },
} as const;

export function isFirebaseEnvConfigured(): boolean {
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
