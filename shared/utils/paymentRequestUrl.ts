/**
 * Origin that hosts the login-free share pages (`/split/:slug`, `/payment/:slug`).
 *
 * Deliberately its own variable rather than reusing `EXPO_PUBLIC_APP_URL`, which
 * points at the legacy web app's origin. (The `/api/*` market functions and the
 * Ganesh phone-auth bridge moved to this same share origin in SPENDLY-522; the
 * `/mobile-google-auth` bridge was removed in SPENDLY-7.)
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
