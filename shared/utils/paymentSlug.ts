/** URL-safe random slug for /payment/:slug share links and participant keys. */

function fillRandomBytes(bytes: Uint8Array): void {
  const webCrypto =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    webCrypto.getRandomValues(bytes);
    return;
  }
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
}

export function generatePaymentSlug(length = 14): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const size = Math.max(1, Math.floor(length));
  const bytes = new Uint8Array(size);
  fillRandomBytes(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
