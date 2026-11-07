import { describe, expect, it } from "vitest";

import { settledAtPatch } from "./splitSettled";

describe("settledAtPatch", () => {
  it("stamps only the first time a split becomes settled", () => {
    expect(settledAtPatch(false, true, 5)).toEqual({ settledAt: 5 });
    expect(settledAtPatch(undefined, true, 5)).toEqual({ settledAt: 5 });
    expect(settledAtPatch(true, true, 5)).toEqual({});
    expect(settledAtPatch(false, false, 5)).toEqual({});
    expect(settledAtPatch(true, false, 5)).toEqual({});
  });
});
