import { describe, expect, it } from "vitest";

import { onlyMetadataChanged } from "@/lib/firestoreSyncState";

const snapshot = (changes: number) => ({
  docChanges: () => new Array(changes).fill({}) as never,
});

describe("onlyMetadataChanged", () => {
  it("never treats the first snapshot as metadata-only, even an empty collection", () => {
    expect(onlyMetadataChanged(snapshot(0), true)).toBe(false);
  });

  it("flags a later event with no document changes (fromCache flip)", () => {
    expect(onlyMetadataChanged(snapshot(0), false)).toBe(true);
  });

  it("treats a later event with document changes as data", () => {
    expect(onlyMetadataChanged(snapshot(2), false)).toBe(false);
  });
});
