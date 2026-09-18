import { describe, expect, it } from "vitest";
import {
  Timestamp,
  arrayRemove,
  arrayUnion,
  increment,
  serverTimestamp,
} from "firebase/firestore";

import {
  FIRESTORE_SENTINEL_KEY,
  decodeFirestoreData,
  encodeFirestoreData,
  encodedDataIsNonIdempotent,
} from "./firestoreSentinel";

describe("firestoreSentinel", () => {
  it("round-trips serverTimestamp, increment and array transforms", () => {
    const encoded = encodeFirestoreData({
      createdAt: serverTimestamp(),
      amountPaid: increment(40),
      paymentIds: arrayUnion("pay-1"),
      removed: arrayRemove("pay-0"),
    }) as Record<string, Record<string, unknown>>;

    expect(encoded.createdAt[FIRESTORE_SENTINEL_KEY]).toBe("serverTimestamp");
    expect(encoded.amountPaid).toEqual({ [FIRESTORE_SENTINEL_KEY]: "increment", n: 40 });
    expect(encodedDataIsNonIdempotent(encoded)).toBe(true);

    const decoded = decodeFirestoreData(encoded) as {
      createdAt: { _methodName: string };
      amountPaid: { _methodName: string; _operand: number };
      paymentIds: { _methodName: string };
      removed: { _methodName: string };
    };
    expect(decoded.createdAt._methodName).toBe("serverTimestamp");
    expect(decoded.amountPaid._methodName).toBe("increment");
    expect(decoded.amountPaid._operand).toBe(40);
    expect(decoded.paymentIds._methodName).toBe("arrayUnion");
    expect(decoded.removed._methodName).toBe("arrayRemove");
  });

  it("round-trips Timestamp values", () => {
    const stamp = Timestamp.fromMillis(1_700_000_000_000);
    const encoded = encodeFirestoreData({ at: stamp }) as {
      at: { [key: string]: unknown; seconds: number; nanoseconds: number };
    };
    expect(encoded.at[FIRESTORE_SENTINEL_KEY]).toBe("timestamp");
    const decoded = decodeFirestoreData(encoded) as { at: Timestamp };
    expect(decoded.at.toMillis()).toBe(stamp.toMillis());
  });

  it("treats a plain expense payload as idempotent", () => {
    const encoded = encodeFirestoreData({
      amount: 120,
      note: "Coffee",
      createdAt: serverTimestamp(),
    });
    expect(encodedDataIsNonIdempotent(encoded)).toBe(false);
  });
});
