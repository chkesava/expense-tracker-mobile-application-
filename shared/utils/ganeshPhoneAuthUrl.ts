/**
 * URL of the web reCAPTCHA bridge that native Ganesh phone sign-in opens
 * (app/ganesh-phone-auth.tsx). SPENDLY-522.
 *
 * The page is registered only in the Ganesh web build, which is published
 * under `/ganesh` on the share site. Native used to open it on
 * EXPO_PUBLIC_APP_URL, the legacy Vite site, which serves a different app at
 * that path, so the bridge never loaded.
 *
 * Empty when no origin is configured; the caller reports that.
 */
export function ganeshPhoneAuthBridgeUrl(
  origin: string,
  phoneNumber: string,
  redirectUri: string
): string {
  const base = origin.trim().replace(/\/+$/, "");
  if (!base) return "";
  return (
    `${base}/ganesh/ganesh-phone-auth` +
    `?phone=${encodeURIComponent(phoneNumber)}&redirect_uri=${encodeURIComponent(redirectUri)}`
  );
}
