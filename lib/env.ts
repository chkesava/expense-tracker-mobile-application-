/**
 * Environment configuration for Expo.
 * Maps former Vite `VITE_*` keys to `EXPO_PUBLIC_*`.
 * Server-only secrets (TWELVE_DATA, CRON, service account) must NEVER be listed here.
 */

function read(key: string): string {
  const value = process.env[key];
  return typeof value === "string" ? value.trim() : "";
}

export const env = {
  /** Public app origin for payment share links (ex-VITE_PUBLIC_APP_URL). */
  publicAppUrl: read("EXPO_PUBLIC_APP_URL"),

  firebase: {
    apiKey: read("EXPO_PUBLIC_FIREBASE_API_KEY"),
    authDomain: read("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: read("EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: read("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: read("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER"),
    appId: read("EXPO_PUBLIC_FIREBASE_APP_ID"),
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
