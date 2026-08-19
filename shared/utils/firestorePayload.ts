/** Plain JSON-style objects only — not FieldValue, Date, Timestamp, etc. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively drop `undefined` fields. Firestore rejects undefined in documents.
 * Arrays are mapped; non-plain objects (FieldValue, Timestamp) are left as-is.
 */
export function omitUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => omitUndefined(item)) as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (nested === undefined) continue;
      out[key] = omitUndefined(nested);
    }
    return out as T;
  }
  return value;
}

export function containsUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(containsUndefined);
  if (isPlainObject(value)) return Object.values(value).some(containsUndefined);
  return false;
}
