/**
 * Origin that hosts the login-free share pages (`/split/:slug`, `/payment/:slug`).
 *
 * Deliberately its own variable rather than reusing `EXPO_PUBLIC_APP_URL`, which
 * also addresses the `/api/*` market functions and the `/mobile-google-auth`
 * bridge. Those live on the legacy web app's origin and are unrelated to
 * sharing, so conflating them meant the share pages could not be hosted
 * independently.
 *
 * Falls back to `EXPO_PUBLIC_APP_URL` so a build that has not set the new
 * variable keeps behaving as it did before.
 *
 * Metro only inlines *static* `process.env.EXPO_PUBLIC_*` reads, so each name
 * has to appear literally here — see the note in `lib/env.ts`.
 */
export function getPublicAppOrigin(): string {
  const env =
    (typeof process !== "undefined" &&
      (process.env.EXPO_PUBLIC_SHARE_URL ||
        process.env.VITE_PUBLIC_SHARE_URL ||
        process.env.EXPO_PUBLIC_APP_URL ||
        process.env.VITE_PUBLIC_APP_URL)) ||
    undefined;
  if (env) return env.replace(/\/$/, "");
  return "";
}

export function getPaymentRequestShareUrl(slug: string): string {
  return `${getPublicAppOrigin()}/payment/${slug}`;
}

export function getSplitShareUrl(slug: string): string {
  return `${getPublicAppOrigin()}/split/${slug}`;
}
