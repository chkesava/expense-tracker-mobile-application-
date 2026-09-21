/**
 * JSON stand-ins for Firestore sentinels so an outbox can replay a write
 * after the process that created it is gone (SPENDLY-23).
 *
 * Detection hazard (SPENDLY-94). A `FieldValue` carries its payload on
 * instance properties that the Firebase release build mangles: in
 * `firebase@12` the `increment` operand ships as `ar` and the array
 * transform elements as `_r`. Only `_methodName` survives, because the
 * public `FieldValue` base constructor assigns it. So this module keys off
 * `_methodName` alone and recovers the payload by shape, never by name.
 *
 * Vitest hides this class of bug: `environment: "node"` resolves
 * `firebase/firestore` to the unminified `index.node.mjs`, where the
 * original names do exist, while Metro and the browser get the mangled
 * bundles. The mangled-shape cases in the sibling test are what actually
 * guard the device path — keep them if this file is revisited.
 */

import {
  Timestamp,
  arrayRemove,
  arrayUnion,
  deleteField,
  increment,
  serverTimestamp,
} from "firebase/firestore";

export const FIRESTORE_SENTINEL_KEY = "__spendlyFv";

const METHOD_NAME_KEY = "_methodName";

type EncodedSentinel =
  | { [FIRESTORE_SENTINEL_KEY]: "serverTimestamp" }
  | { [FIRESTORE_SENTINEL_KEY]: "deleteField" }
  | { [FIRESTORE_SENTINEL_KEY]: "increment"; n: number }
  | { [FIRESTORE_SENTINEL_KEY]: "arrayUnion"; values: unknown[] }
  | { [FIRESTORE_SENTINEL_KEY]: "arrayRemove"; values: unknown[] }
  | {
      [FIRESTORE_SENTINEL_KEY]: "timestamp";
      seconds: number;
      nanoseconds: number;
    };

type MethodNamed = { _methodName?: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isTimestampLike(value: object): value is { seconds: number; nanoseconds: number } {
  if (value instanceof Timestamp) return true;
  const candidate = value as { seconds?: unknown; nanoseconds?: unknown; toMillis?: unknown };
  return (
    typeof candidate.seconds === "number" &&
    typeof candidate.nanoseconds === "number" &&
    typeof candidate.toMillis === "function"
  );
}

/**
 * The first own data property matching `predicate`, ignoring `_methodName`.
 *
 * A sentinel holds exactly one payload property, so its shape identifies it
 * whatever the minifier called it. Only data descriptors are read: probing
 * an accessor on an unknown object could run code this module does not own.
 */
function ownDataValue<T>(
  value: object,
  predicate: (candidate: unknown) => candidate is T
): T | undefined {
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === METHOD_NAME_KEY) continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) continue;
    if (predicate(descriptor.value)) return descriptor.value;
  }
  return undefined;
}

const isNumber = (candidate: unknown): candidate is number => typeof candidate === "number";
const isArray = (candidate: unknown): candidate is unknown[] => Array.isArray(candidate);

/**
 * `null` means "not a sentinel after all" — an ordinary payload that merely
 * carries a `_methodName` field still encodes as a plain object.
 */
function encodeFieldValue(value: object, methodName: string): EncodedSentinel | null {
  switch (methodName) {
    case "serverTimestamp":
      return { [FIRESTORE_SENTINEL_KEY]: "serverTimestamp" };
    case "deleteField":
      return { [FIRESTORE_SENTINEL_KEY]: "deleteField" };
    case "increment": {
      const operand = ownDataValue(value, isNumber);
      if (operand === undefined) {
        throw new Error("Write outbox cannot serialise increment");
      }
      return { [FIRESTORE_SENTINEL_KEY]: "increment", n: operand };
    }
    case "arrayUnion":
    case "arrayRemove": {
      const elements = ownDataValue(value, isArray);
      if (!elements) {
        throw new Error(`Write outbox cannot serialise ${methodName}`);
      }
      return {
        [FIRESTORE_SENTINEL_KEY]: methodName,
        values: elements.map(encodeFirestoreData),
      };
    }
    // Real sentinels the outbox has no stand-in for. Naming them beats the
    // generic message, which reads like a corrupt payload.
    case "minimum":
    case "maximum":
      throw new Error(`Write outbox cannot serialise ${methodName}`);
    default:
      return null;
  }
}

function encodeSentinel(value: object): EncodedSentinel | null {
  const methodName = (value as MethodNamed)[METHOD_NAME_KEY];
  if (typeof methodName === "string") {
    const encoded = encodeFieldValue(value, methodName);
    if (encoded) return encoded;
  }

  const fake = value as {
    __serverTimestamp?: unknown;
    __increment?: unknown;
    __arrayUnion?: unknown;
    __arrayRemove?: unknown;
  };
  if (fake.__serverTimestamp === true) {
    return { [FIRESTORE_SENTINEL_KEY]: "serverTimestamp" };
  }
  if (typeof fake.__increment === "number") {
    return { [FIRESTORE_SENTINEL_KEY]: "increment", n: fake.__increment };
  }
  if (Array.isArray(fake.__arrayUnion)) {
    return {
      [FIRESTORE_SENTINEL_KEY]: "arrayUnion",
      values: fake.__arrayUnion.map(encodeFirestoreData),
    };
  }
  if (Array.isArray(fake.__arrayRemove)) {
    return {
      [FIRESTORE_SENTINEL_KEY]: "arrayRemove",
      values: fake.__arrayRemove.map(encodeFirestoreData),
    };
  }

  if (isTimestampLike(value)) {
    return {
      [FIRESTORE_SENTINEL_KEY]: "timestamp",
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    };
  }
  if (value instanceof Date) {
    const timestamp = Timestamp.fromDate(value);
    return {
      [FIRESTORE_SENTINEL_KEY]: "timestamp",
      seconds: timestamp.seconds,
      nanoseconds: timestamp.nanoseconds,
    };
  }
  return null;
}

export function encodeFirestoreData(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    return value.map(encodeFirestoreData).filter((item) => item !== undefined);
  }
  if (typeof value !== "object") {
    throw new Error("Write outbox cannot serialise this value");
  }
  const sentinel = encodeSentinel(value);
  if (sentinel) return sentinel;
  if (!isPlainObject(value)) {
    throw new Error("Write outbox cannot serialise this value");
  }
  const encoded: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (nested === undefined) continue;
    encoded[key] = encodeFirestoreData(nested);
  }
  return encoded;
}

export function decodeFirestoreData(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(decodeFirestoreData);
  const record = value as Record<string, unknown>;
  const kind = record[FIRESTORE_SENTINEL_KEY];
  if (kind === "serverTimestamp") return serverTimestamp();
  if (kind === "deleteField") return deleteField();
  if (kind === "increment") return increment(Number(record.n) || 0);
  if (kind === "arrayUnion") {
    const values = Array.isArray(record.values) ? record.values.map(decodeFirestoreData) : [];
    return arrayUnion(...values);
  }
  if (kind === "arrayRemove") {
    const values = Array.isArray(record.values) ? record.values.map(decodeFirestoreData) : [];
    return arrayRemove(...values);
  }
  if (kind === "timestamp") {
    return new Timestamp(Number(record.seconds) || 0, Number(record.nanoseconds) || 0);
  }
  const decoded: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(record)) {
    decoded[key] = decodeFirestoreData(nested);
  }
  return decoded;
}

export function encodedDataIsNonIdempotent(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(encodedDataIsNonIdempotent);
  const record = value as Record<string, unknown>;
  const kind = record[FIRESTORE_SENTINEL_KEY];
  if (kind === "increment" || kind === "arrayUnion" || kind === "arrayRemove") {
    return true;
  }
  return Object.values(record).some(encodedDataIsNonIdempotent);
}
