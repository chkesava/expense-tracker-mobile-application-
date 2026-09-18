/**
 * JSON stand-ins for Firestore sentinels so an outbox can replay a write
 * after the process that created it is gone (SPENDLY-23).
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

type MethodNamed = { _methodName?: string; _operand?: number; _elements?: unknown[] };

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

function encodeSentinel(value: object): EncodedSentinel | null {
  const named = value as MethodNamed;
  if (named._methodName === "serverTimestamp") {
    return { [FIRESTORE_SENTINEL_KEY]: "serverTimestamp" };
  }
  if (named._methodName === "deleteField") {
    return { [FIRESTORE_SENTINEL_KEY]: "deleteField" };
  }
  if (named._methodName === "increment" && typeof named._operand === "number") {
    return { [FIRESTORE_SENTINEL_KEY]: "increment", n: named._operand };
  }
  if (named._methodName === "arrayUnion" && Array.isArray(named._elements)) {
    return {
      [FIRESTORE_SENTINEL_KEY]: "arrayUnion",
      values: named._elements.map(encodeFirestoreData),
    };
  }
  if (named._methodName === "arrayRemove" && Array.isArray(named._elements)) {
    return {
      [FIRESTORE_SENTINEL_KEY]: "arrayRemove",
      values: named._elements.map(encodeFirestoreData),
    };
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
