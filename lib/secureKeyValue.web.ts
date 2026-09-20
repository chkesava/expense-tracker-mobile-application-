/**
 * Web build of the secret store — SPENDLY-22 (AUTH-04).
 *
 * `expo-secure-store` has no web implementation; its stubs reject, which is
 * why `hooks/useBiometrics.ts` gates itself off with `Platform.OS !== "web"`.
 * So the web build uses `localStorage`.
 *
 * **This is not hardware-backed and is not a secret store.** Anything here is
 * readable by any script on the origin and by anyone with the machine. It is
 * still a strict improvement on the previous design, where the PIN hash lived
 * on `users/{uid}` in Firestore and was therefore exposed to anyone who could
 * read that document — a console session, a backup, an export — from anywhere.
 *
 * The privacy lock keeps working on web because a lock that quietly vanishes
 * there would be a worse answer than one that is honest about its limits.
 * `docs/SPENDLY-22-privacy-lock-boundary.md` states those limits; keep the two
 * in step.
 */

import type { SecureKeyValueStore } from "./secureKeyValue";

export type { SecureKeyValueStore } from "./secureKeyValue";

/** False here: see the module comment. */
export const SECURE_STORAGE_IS_HARDWARE_BACKED = false;

export function secureKeySegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Safari denies localStorage in some private modes rather than returning
    // null. A thrown SecurityError must not take the app down.
    return null;
  }
}

export const secureKeyValue: SecureKeyValueStore = {
  async getItem(key) {
    return storage()?.getItem(key) ?? null;
  },
  async setItem(key, value) {
    storage()?.setItem(key, value);
  },
  async removeItem(key) {
    storage()?.removeItem(key);
  },
};
