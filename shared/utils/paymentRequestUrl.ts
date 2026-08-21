/**
 * Public origin for hosted payment pages / share links.
 * Prefer EXPO_PUBLIC_APP_URL (mobile) or VITE_PUBLIC_APP_URL (web builds sharing this module).
 */
export function getPublicAppOrigin(): string {
  const env =
    (typeof process !== "undefined" &&
      (process.env.EXPO_PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL)) ||
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
