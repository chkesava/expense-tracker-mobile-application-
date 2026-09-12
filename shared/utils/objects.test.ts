import { describe, expect, it } from "vitest";

import { withoutUndefined } from "@/shared/utils/objects";

describe("withoutUndefined", () => {
  it("drops undefined values, which Firestore rejects outright", () => {
    expect(withoutUndefined({ a: 1, b: undefined, c: "x" })).toEqual({ a: 1, c: "x" });
  });

  it("keeps null — it is a real value, not an absent one", () => {
    // EPF relies on this: `statusReason: next.statusReason ?? null` clears a
    // reason, where undefined would leave the old one in place.
    expect(withoutUndefined({ a: null })).toEqual({ a: null });
  });

  it("keeps falsy values that are not undefined", () => {
    expect(withoutUndefined({ zero: 0, empty: "", no: false })).toEqual({
      zero: 0,
      empty: "",
      no: false,
    });
  });

  it("removes the key entirely rather than setting it to null", () => {
    expect(Object.keys(withoutUndefined({ a: 1, b: undefined }))).toEqual(["a"]);
  });

  it("does not mutate its input", () => {
    const input = { a: 1, b: undefined };
    withoutUndefined(input);
    expect("b" in input).toBe(true);
  });

  it("handles an empty object", () => {
    expect(withoutUndefined({})).toEqual({});
  });
});
