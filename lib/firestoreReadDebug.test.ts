import { afterEach, describe, expect, it, vi } from "vitest";

import {
  forgetSnapshotPath,
  logQuerySnapshot,
  resetFirestoreReadDebug,
} from "./firestoreReadDebug";

describe("firestoreReadDebug", () => {
  afterEach(() => {
    resetFirestoreReadDebug();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("logs attach then update for the same path", () => {
    vi.stubGlobal("__DEV__", true);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);

    logQuerySnapshot("users/u/expenses", {
      size: 12,
      metadata: { fromCache: true },
    });
    logQuerySnapshot("users/u/expenses", {
      size: 13,
      metadata: { fromCache: false },
    });

    expect(debug).toHaveBeenNthCalledWith(
      1,
      "[fs-read] attach users/u/expenses docs=12 source=cache"
    );
    expect(debug).toHaveBeenNthCalledWith(
      2,
      "[fs-read] update users/u/expenses docs=13 source=server"
    );
  });

  it("does not log outside __DEV__", () => {
    vi.stubGlobal("__DEV__", false);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);

    logQuerySnapshot("users/u/expenses", { size: 99 });

    expect(debug).not.toHaveBeenCalled();
  });

  it("treats a forgotten path as a new attach", () => {
    vi.stubGlobal("__DEV__", true);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);

    logQuerySnapshot("users/u/categories", { size: 4, metadata: { fromCache: false } });
    forgetSnapshotPath("users/u/categories");
    logQuerySnapshot("users/u/categories", { size: 4, metadata: { fromCache: true } });

    expect(debug.mock.calls[1]?.[0]).toContain("attach users/u/categories");
  });
});
