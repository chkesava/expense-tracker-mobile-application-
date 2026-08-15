/**
 * Privacy-lock PIN hashing. PINs are stored on `users/{uid}` in Firestore
 * (synced/cached like the rest of settings), so they must not be kept in
 * plaintext there — hash before persisting, compare hashes on unlock.
 *
 * `pinMatches` also accepts a legacy plaintext 4-digit value for the stored
 * side, so PINs set before this change keep working until the user re-sets
 * them (at which point they're hashed going forward).
 */
import * as Crypto from "expo-crypto";

const SHA256_HEX_LENGTH = 64;

export async function hashPin(pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin);
}

function isLikelyHash(value: string): boolean {
  return value.length === SHA256_HEX_LENGTH && /^[0-9a-f]+$/i.test(value);
}

export async function pinMatches(
  inputPin: string,
  storedValue: string
): Promise<boolean> {
  if (!storedValue) return false;
  if (isLikelyHash(storedValue)) {
    return (await hashPin(inputPin)) === storedValue;
  }
  // Legacy plaintext PIN set before hashing was introduced.
  return inputPin === storedValue;
}
