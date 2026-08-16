import * as Crypto from "expo-crypto";

/** Stable unique id for Firestore docs (matches web `crypto.randomUUID()`). */
export function newId(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
