import { afterEach, describe, expect, it } from "vitest";
import {
  getGlobalLastServerSyncAt,
  getGlobalPendingSyncCount,
  setGlobalLastServerSyncAt,
  setGlobalPendingSyncCount,
  useGlobalLastServerSyncAt,
  useGlobalPendingSyncCount,
} from "./syncStatusStore";

describe("syncStatusStore", () => {
  afterEach(() => {
    setGlobalPendingSyncCount(0);
    setGlobalLastServerSyncAt(null);
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

  it("stamps last server sync and ignores identical writes", () => {
    expect(getGlobalLastServerSyncAt()).toBeNull();
    setGlobalLastServerSyncAt(1_700_000_000_000);
    expect(getGlobalLastServerSyncAt()).toBe(1_700_000_000_000);
    setGlobalLastServerSyncAt(1_700_000_000_000);
    expect(getGlobalLastServerSyncAt()).toBe(1_700_000_000_000);
    setGlobalLastServerSyncAt(1_700_000_000_500);
    expect(getGlobalLastServerSyncAt()).toBe(1_700_000_000_500);
    setGlobalLastServerSyncAt(null);
    expect(getGlobalLastServerSyncAt()).toBeNull();
    expect(typeof useGlobalLastServerSyncAt).toBe("function");
  });
});
