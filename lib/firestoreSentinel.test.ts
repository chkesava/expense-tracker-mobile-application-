import { describe, expect, it } from "vitest";
import {
  Timestamp,
  arrayRemove,
  arrayUnion,
  deleteField,
  increment,
  serverTimestamp,
} from "firebase/firestore";

import {
  FIRESTORE_SENTINEL_KEY,
  decodeFirestoreData,
  encodeFirestoreData,
  encodedDataIsNonIdempotent,
} from "./firestoreSentinel";

/**
 * Sentinels as the app actually receives them (SPENDLY-94).
 *
 * Vitest runs on node, so `firebase/firestore` here is the unminified
 * `index.node.mjs` and its `FieldValue` payloads still sit on `_operand` /
 * `_elements`. Metro and the browser load bundles where the minifier
 * renamed those to `ar` / `_r` and only `_methodName` survived — which is
 * why Pay Bill threw on device while this suite stayed green. These doubles
 * reproduce the shipped shape: a class instance (so `isPlainObject` rejects
 * it) with `_methodName` and the payload under a mangled key.
 */
class MangledFieldValue {
  constructor(public _methodName: string) {}
}

function mangled(methodName: string, payload?: Record<string, unknown>): object {
  return Object.assign(new MangledFieldValue(methodName), payload ?? {});
}

describe("firestoreSentinel", () => {
  describe("minified sentinel shapes", () => {
    it("encodes increment when the operand sits on a mangled property", () => {
      const encoded = encodeFirestoreData(mangled("increment", { ar: 40 }));
      expect(encoded).toEqual({ [FIRESTORE_SENTINEL_KEY]: "increment", n: 40 });
    });

    it("encodes arrayUnion and arrayRemove when the elements sit on a mangled property", () => {
      expect(encodeFirestoreData(mangled("arrayUnion", { _r: ["pay-1"] }))).toEqual({
        [FIRESTORE_SENTINEL_KEY]: "arrayUnion",
        values: ["pay-1"],
      });
      expect(encodeFirestoreData(mangled("arrayRemove", { _r: ["pay-1"] }))).toEqual({
        [FIRESTORE_SENTINEL_KEY]: "arrayRemove",
        values: ["pay-1"],
      });
    });

    it("encodes the payload-free sentinels", () => {
      expect(encodeFirestoreData(mangled("serverTimestamp"))).toEqual({
        [FIRESTORE_SENTINEL_KEY]: "serverTimestamp",
      });
      expect(encodeFirestoreData(mangled("deleteField"))).toEqual({
        [FIRESTORE_SENTINEL_KEY]: "deleteField",
      });
    });

    it("encodes the Pay Bill statement stamp that used to throw", () => {
      const stamp = {
        amountPaid: mangled("increment", { ar: 4000 }),
        paymentIds: mangled("arrayUnion", { _r: ["pay-1"] }),
        paymentDate: "2026-09-21",
        remainingAmount: 6000,
        status: "PARTIALLY_PAID",
        updatedAt: mangled("serverTimestamp"),
      };

      const encoded = encodeFirestoreData(stamp) as Record<string, unknown>;

      expect(encoded).toEqual({
        amountPaid: { [FIRESTORE_SENTINEL_KEY]: "increment", n: 4000 },
        paymentIds: { [FIRESTORE_SENTINEL_KEY]: "arrayUnion", values: ["pay-1"] },
        paymentDate: "2026-09-21",
        remainingAmount: 6000,
        status: "PARTIALLY_PAID",
        updatedAt: { [FIRESTORE_SENTINEL_KEY]: "serverTimestamp" },
      });
      // The outbox has to keep reading this batch as replay-unsafe, or the
      // ack check that stops a double increment is skipped.
      expect(encodedDataIsNonIdempotent(encoded)).toBe(true);
      expect(() => JSON.stringify(encoded)).not.toThrow();
    });

    it("names the sentinel when its payload cannot be recovered", () => {
      expect(() => encodeFirestoreData(mangled("increment"))).toThrow(
        "Write outbox cannot serialise increment"
      );
      expect(() => encodeFirestoreData(mangled("arrayUnion"))).toThrow(
        "Write outbox cannot serialise arrayUnion"
      );
      expect(() => encodeFirestoreData(mangled("minimum", { ar: 1 }))).toThrow(
        "Write outbox cannot serialise minimum"
      );
    });

    it("still encodes a plain payload that happens to carry a _methodName field", () => {
      expect(encodeFirestoreData({ _methodName: "not a sentinel", amount: 12 })).toEqual({
        _methodName: "not a sentinel",
        amount: 12,
      });
    });
  });

  describe("real SDK sentinels", () => {
    it("round-trips serverTimestamp, increment and array transforms", () => {
      const payload = {
        createdAt: serverTimestamp(),
        amountPaid: increment(40),
        paymentIds: arrayUnion("pay-1"),
        removed: arrayRemove("pay-0"),
        cleared: deleteField(),
      };
      const encoded = encodeFirestoreData(payload) as Record<string, Record<string, unknown>>;

      expect(encoded.createdAt[FIRESTORE_SENTINEL_KEY]).toBe("serverTimestamp");
      expect(encoded.amountPaid).toEqual({ [FIRESTORE_SENTINEL_KEY]: "increment", n: 40 });
      expect(encoded.paymentIds).toEqual({
        [FIRESTORE_SENTINEL_KEY]: "arrayUnion",
        values: ["pay-1"],
      });
      expect(encoded.removed).toEqual({
        [FIRESTORE_SENTINEL_KEY]: "arrayRemove",
        values: ["pay-0"],
      });
      expect(encoded.cleared[FIRESTORE_SENTINEL_KEY]).toBe("deleteField");
      expect(encodedDataIsNonIdempotent(encoded)).toBe(true);

      // Asserting on the decoded FieldValue internals would only restate
      // whichever property names this bundle happens to use. Re-encoding the
      // rebuilt sentinels proves the round trip without naming them.
      expect(encodeFirestoreData(decodeFirestoreData(encoded))).toEqual(encoded);
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

    it("round-trips Date values as timestamps", () => {
      const date = new Date("2026-09-21T10:30:00.000Z");
      const encoded = encodeFirestoreData({ at: date }) as {
        at: Record<string, unknown>;
      };
      expect(encoded.at[FIRESTORE_SENTINEL_KEY]).toBe("timestamp");
      const decoded = decodeFirestoreData(encoded) as { at: Timestamp };
      expect(decoded.at.toMillis()).toBe(date.getTime());
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

  describe("test-double sentinels", () => {
    // The credit card bill suites mock `firebase/firestore` with these tagged
    // shapes, so the encoder has to keep understanding them.
    it("encodes the __-prefixed fakes", () => {
      const encoded = encodeFirestoreData({
        createdAt: { __serverTimestamp: true },
        amountPaid: { __increment: 40 },
        paymentIds: { __arrayUnion: ["pay-1"] },
        removed: { __arrayRemove: ["pay-0"] },
      });
      expect(encoded).toEqual({
        createdAt: { [FIRESTORE_SENTINEL_KEY]: "serverTimestamp" },
        amountPaid: { [FIRESTORE_SENTINEL_KEY]: "increment", n: 40 },
        paymentIds: { [FIRESTORE_SENTINEL_KEY]: "arrayUnion", values: ["pay-1"] },
        removed: { [FIRESTORE_SENTINEL_KEY]: "arrayRemove", values: ["pay-0"] },
      });
    });
  });

  describe("unsupported values", () => {
    it("refuses a class instance it cannot stand in for", () => {
      class Money {
        constructor(public amount: number) {}
      }
      expect(() => encodeFirestoreData({ total: new Money(10) })).toThrow(
        "Write outbox cannot serialise this value"
      );
    });
  });
});
