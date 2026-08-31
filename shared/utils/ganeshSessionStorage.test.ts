import { describe, expect, it } from "vitest";

import {
  emptyGaneshSession,
  ganeshSessionStorageKey,
  GANESH_SESSION_LEGACY_KEY,
  hasGaneshSession,
  parseGaneshSession,
} from "@/shared/utils/ganeshSessionStorage";

describe("ganeshSessionStorage", () => {
  it("namespaces the session key by uid", () => {
    expect(ganeshSessionStorageKey("user-1")).toBe("@ganesh_session:user-1");
    expect(ganeshSessionStorageKey("user-1")).not.toBe(GANESH_SESSION_LEGACY_KEY);
    expect(ganeshSessionStorageKey("a")).not.toBe(ganeshSessionStorageKey("b"));
  });

  it("parses a saved session and ignores invalid JSON", () => {
    expect(parseGaneshSession(null)).toBeNull();
    expect(parseGaneshSession("{not-json")).toBeNull();
    expect(parseGaneshSession(JSON.stringify({ pandalId: "p1", festivalId: "f1" }))).toEqual({
      pandalId: "p1",
      festivalId: "f1",
    });
  });

  it("treats empty ids as no session", () => {
    expect(hasGaneshSession(emptyGaneshSession())).toBe(false);
    expect(hasGaneshSession({ pandalId: "p1", festivalId: null })).toBe(true);
    expect(hasGaneshSession(null)).toBe(false);
  });
});
