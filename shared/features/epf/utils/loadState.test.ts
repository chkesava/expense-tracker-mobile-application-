import { describe, expect, it, vi } from "vitest";

import { combineEpfLoad } from "@/shared/features/epf/utils/loadState";

const ok = { loading: false, error: null };

describe("combineEpfLoad", () => {
  it("is loading while any source is loading", () => {
    expect(combineEpfLoad([ok, { loading: true, error: null }, ok]).loading).toBe(true);
  });

  it("is not loading once every source has settled", () => {
    expect(combineEpfLoad([ok, ok, ok]).loading).toBe(false);
  });

  it("reports an error from any source, not just the first few", () => {
    // The defect this replaces: EpfBalanceTab consumed contributions and
    // interest but never transfers, so a transfers failure rendered a balance
    // silently missing every transfer.
    const transfers = new Error("transfers listener failed");
    const state = combineEpfLoad([ok, ok, { loading: false, error: transfers }]);
    expect(state.error).toBe(transfers);
  });

  it("keeps every error instead of discarding all but one", () => {
    // `a ?? b` in EpfBalanceTab and EpfDashboard threw the second one away.
    const first = new Error("contributions");
    const second = new Error("interest");
    const state = combineEpfLoad([
      { loading: false, error: first },
      { loading: false, error: second },
    ]);
    expect(state.errors).toEqual([first, second]);
    expect(state.error).toBe(first);
  });

  it("has a null error when nothing failed", () => {
    const state = combineEpfLoad([ok, ok]);
    expect(state.error).toBeNull();
    expect(state.errors).toEqual([]);
  });

  it("treats an error as an error even while another source still loads", () => {
    // A partial failure must not hide behind a skeleton forever.
    const boom = new Error("boom");
    const state = combineEpfLoad([{ loading: true, error: null }, { loading: false, error: boom }]);
    expect(state.loading).toBe(true);
    expect(state.error).toBe(boom);
  });

  it("retries every source that offers a retry", () => {
    const a = vi.fn();
    const c = vi.fn();
    combineEpfLoad([
      { loading: false, error: null, retry: a },
      { loading: false, error: null },
      { loading: false, error: null, retry: c },
    ]).retryAll();
    expect(a).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);
  });

  it("survives a source with no retry at all", () => {
    expect(() => combineEpfLoad([ok]).retryAll()).not.toThrow();
  });

  it("handles no sources", () => {
    const state = combineEpfLoad([]);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("ignores undefined errors as well as null", () => {
    expect(combineEpfLoad([{ loading: false }, { loading: false }]).errors).toEqual([]);
  });
});
