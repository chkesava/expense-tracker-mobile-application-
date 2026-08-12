import { afterEach, describe, expect, it } from "vitest";
import {
  getGlobalPendingSyncCount,
  setGlobalPendingSyncCount,
  useGlobalPendingSyncCount,
} from "./syncStatusStore";

describe("syncStatusStore", () => {
  afterEach(() => {
    setGlobalPendingSyncCount(0);
  });

  it("updates pending sync count and ignores identical writes", () => {
    expect(getGlobalPendingSyncCount()).toBe(0);
    setGlobalPendingSyncCount(2);
    expect(getGlobalPendingSyncCount()).toBe(2);
    setGlobalPendingSyncCount(2);
    expect(getGlobalPendingSyncCount()).toBe(2);
    setGlobalPendingSyncCount(4);
    expect(getGlobalPendingSyncCount()).toBe(4);
    expect(typeof useGlobalPendingSyncCount).toBe("function");
  });

  it("resets to zero", () => {
    setGlobalPendingSyncCount(9);
    setGlobalPendingSyncCount(0);
    expect(getGlobalPendingSyncCount()).toBe(0);
  });
});
