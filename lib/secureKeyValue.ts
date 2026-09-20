/**
 * Device-local key/value storage for secrets — SPENDLY-22 (AUTH-04).
 *
 * Native: `expo-secure-store`, which is backed by the Android Keystore and the
 * iOS Keychain. The privacy PIN lives here rather than on `users/{uid}` in
 * Firestore, where it synced to every device and was readable by anyone who
 * could read the user document.
 *
 * See `lib/secureKeyValue.web.ts` for the web build, which has no keychain to
 * offer and says so.
 *
 * SecureStore keys must match `[A-Za-z0-9._-]`, so every caller goes through
 * {@link secureKeySegment} for anything derived from a uid.
 */

export type SecureKeyValueStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

/**
 * Whether this platform backs the store with real hardware.
 *
 * `false` on web. Callers use it for honest wording, never to decide whether
 * to store the PIN — a lock that silently stops existing on web would be worse
 * than one that is frank about its limits.
 */
export const SECURE_STORAGE_IS_HARDWARE_BACKED = true;

/** Make an arbitrary string safe for a SecureStore key. */
export function secureKeySegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

export const secureKeyValue: SecureKeyValueStore = {
  async getItem(key) {
    const SecureStore = await import("expo-secure-store");
    return SecureStore.getItemAsync(key);
  },
  async setItem(key, value) {
    const SecureStore = await import("expo-secure-store");
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key) {
    const SecureStore = await import("expo-secure-store");
    await SecureStore.deleteItemAsync(key);
  },
};
