import { afterEach, describe, expect, it, vi } from "vitest";

import {
  forgetSnapshotPath,
  getFirestoreReadStats,
  logDirectRead,
  logQuerySnapshot,
  resetFirestoreReadDebug,
} from "./firestoreReadDebug";

describe("firestoreReadDebug", () => {
  afterEach(() => {
    resetFirestoreReadDebug();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("logs attach then update for the same path and aggregates stats", () => {
    vi.stubGlobal("__DEV__", true);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);

    logQuerySnapshot(
      "users/u/expenses",
      {
        size: 12,
        metadata: { fromCache: true },
      },
      { feature: "ledger", queryShape: "limit=300" }
    );
    logQuerySnapshot(
      "users/u/expenses",
      {
        size: 13,
        metadata: { fromCache: false },
      },
      { feature: "ledger" }
    );

    expect(debug).toHaveBeenNthCalledWith(
      1,
      "[fs-read] attach users/u/expenses docs=12 source=cache [ledger] query=limit=300"
    );
    expect(debug).toHaveBeenNthCalledWith(
      2,
      "[fs-read] update users/u/expenses docs=13 source=server [ledger]"
    );

    const stats = getFirestoreReadStats();
    expect(stats.totalCacheReads).toBe(12);
    expect(stats.totalServerReads).toBe(13);
    expect(stats.totalListenerAttaches).toBe(1);
    expect(stats.totalListenerUpdates).toBe(1);
    expect(stats.collectionStats.expenses).toEqual({
      cacheReads: 12,
      serverReads: 13,
      attaches: 1,
      updates: 1,
      directGets: 0,
    });
  });

  it("tracks direct gets and attributes them accurately", () => {
    vi.stubGlobal("__DEV__", true);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);

    logDirectRead("users/u/categories", 5, "server", {
      feature: "categories-edit",
      queryShape: "collection",
    });

    expect(debug).toHaveBeenCalledWith(
      "[fs-read] direct-get users/u/categories docs=5 source=server [categories-edit] query=collection"
    );

    const stats = getFirestoreReadStats();
    expect(stats.totalDirectGetDocs).toBe(1);
    expect(stats.totalServerReads).toBe(5);
    expect(stats.collectionStats.categories.directGets).toBe(1);
    expect(stats.collectionStats.categories.serverReads).toBe(5);
  });

  it("does not log outside __DEV__ or PERF_MARKS", () => {
    vi.stubGlobal("__DEV__", false);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);

    logQuerySnapshot("users/u/expenses", { size: 99 });
    logDirectRead("users/u/categories", 10);

    expect(debug).not.toHaveBeenCalled();
    const stats = getFirestoreReadStats();
    expect(stats.totalServerReads).toBe(0);
  });

  it("treats a forgotten path as a new attach", () => {
    vi.stubGlobal("__DEV__", true);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);

    logQuerySnapshot("users/u/accounts", { size: 2 });
    forgetSnapshotPath("users/u/accounts");
    logQuerySnapshot("users/u/accounts", { size: 2 });

    expect(debug).toHaveBeenNthCalledWith(
      1,
      "[fs-read] attach users/u/accounts docs=2 source=server"
    );
    expect(debug).toHaveBeenNthCalledWith(
      2,
      "[fs-read] attach users/u/accounts docs=2 source=server"
    );
  });
});
