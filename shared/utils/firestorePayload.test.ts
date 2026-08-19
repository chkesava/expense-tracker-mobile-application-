import { describe, expect, it } from "vitest";
import { containsUndefined, omitUndefined } from "./firestorePayload";

describe("omitUndefined", () => {
  it("drops undefined fields on a plain object", () => {
    const result = omitUndefined({
      name: "Alice",
      userId: undefined,
      photoURL: undefined,
      amount: 10,
    });
    expect(result).toEqual({ name: "Alice", amount: 10 });
    expect(containsUndefined(result)).toBe(false);
  });

  it("strips nested participant arrays", () => {
    const result = omitUndefined({
      title: "Dinner",
      participants: [
        { name: "You", paid: true, userId: undefined },
        { name: "Bob", paid: false, upiId: undefined },
      ],
    });
    expect(result).toEqual({
      title: "Dinner",
      participants: [{ name: "You", paid: true }, { name: "Bob", paid: false }],
    });
    expect(containsUndefined(result)).toBe(false);
  });

  it("keeps null and does not recurse into class instances", () => {
    const stamp = { constructor: Date, seconds: 1 };
    const date = new Date("2026-01-01T00:00:00Z");
    const result = omitUndefined({
      note: null,
      createdAt: date,
      dummy: stamp,
    });
    expect(result.note).toBeNull();
    expect(result.createdAt).toBe(date);
  });
});
