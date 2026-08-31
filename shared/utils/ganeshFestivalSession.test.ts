import { describe, expect, it } from "vitest";

import {
  pickFestivalFromList,
  resolveSessionFestival,
} from "@/shared/utils/ganeshFestivalSession";

describe("session festival resolution", () => {
  const festivals = [
    { id: "closed-25", status: "closed" },
    { id: "open-26", status: "open" },
  ];

  it("keeps a festival id that is still on the pandal list", () => {
    expect(resolveSessionFestival("closed-25", festivals, true)).toEqual({ action: "keep" });
  });

  it("switches a stale id to an open festival", () => {
    expect(resolveSessionFestival("deleted", festivals, true)).toEqual({
      action: "switch",
      festivalId: "open-26",
    });
  });

  it("falls back to the first festival when none are open", () => {
    const closed = [{ id: "a", status: "closed" }, { id: "b", status: "closed" }];
    expect(resolveSessionFestival("gone", closed, true)).toEqual({
      action: "switch",
      festivalId: "a",
    });
    expect(pickFestivalFromList(closed)?.id).toBe("a");
  });

  it("does not clear while the list is empty or still loading", () => {
    expect(resolveSessionFestival("stale", [], false)).toEqual({ action: "keep" });
    expect(resolveSessionFestival("stale", [], true)).toEqual({ action: "keep" });
  });
});
