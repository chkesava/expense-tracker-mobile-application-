/** URL-safe random slug for /payment/:slug share links and participant keys. */

function fillRandomBytes(length: number): Uint8Array {
  // ArrayBuffer-backed view satisfies Crypto.getRandomValues under TS 5.7+/6 DOM libs
  // (bare `new Uint8Array(n)` is typed as Uint8Array<ArrayBufferLike>).
  const bytes = new Uint8Array(new ArrayBuffer(length));
  const webCrypto =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    webCrypto.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

export function generatePaymentSlug(length = 14): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const size = Math.max(1, Math.floor(length));
  const bytes = fillRandomBytes(size);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
