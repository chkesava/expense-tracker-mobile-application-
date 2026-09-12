/**
 * Object shaping helpers for Firestore payloads — KAN-73.
 *
 * `withoutUndefined` was defined identically in four hook files. Firestore
 * rejects `undefined` values outright, so every create path in the app depends
 * on this behaving, and none of the four copies was covered by a test.
 */

/** Drop keys whose value is `undefined`. `null` is kept — it is a real value. */
export function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (val !== undefined) out[key] = val;
  }
  return out as T;
}
