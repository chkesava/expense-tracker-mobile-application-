import { afterEach, describe, expect, it, vi } from "vitest";

import { isReadMeterEnabled, meterReads, readInventory, refPath, sdkExport } from "./firestoreReadMeter";

const querySnap = (size: number, opts: { fromCache?: boolean; parent?: string } = {}) => ({
  size,
  docs: Array.from({ length: size }, () => ({ ref: { parent: { path: opts.parent ?? "users/u1/expenses" } } })),
  docChanges: () => Array.from({ length: size }),
  metadata: { fromCache: opts.fromCache ?? false, hasPendingWrites: false },
});

function fakeSdk() {
  const listeners: ((snap: unknown) => void)[] = [];
  const unsubscribe = vi.fn();
  const onSnapshot = vi.fn((_ref: unknown, ...rest: unknown[]) => {
    const target = rest.find((r) => typeof r === "function" || (r && typeof r === "object" && "next" in r));
    listeners.push(typeof target === "function" ? (target as (s: unknown) => void) : (s) => (target as { next: (s: unknown) => void }).next(s));
    return unsubscribe;
  });
  const getDoc = vi.fn(async (..._args: unknown[]) => ({ exists: () => true, metadata: { fromCache: false } }));
  const getDocs = vi.fn(async (..._args: unknown[]) => querySnap(3, { parent: "users/u1/categories" }));
  return { sdk: { onSnapshot, getDoc, getDocs }, emit: (s: unknown) => listeners.forEach((l) => l(s)), unsubscribe };
}

afterEach(() => {
  readInventory.reset();
});

describe("meterReads (SPENDLY-588)", () => {
  it("is off under vitest, so every test keeps the SDK's own functions", () => {
    expect(isReadMeterEnabled()).toBe(false);
    const { sdk } = fakeSdk();
    const reads = meterReads(sdk);
    expect(reads.onSnapshot).toBe(sdk.onSnapshot);
    expect(reads.getDoc).toBe(sdk.getDoc);
    expect(reads.getDocs).toBe(sdk.getDocs);
  });

  it("meters a listener with an onNext callback and passes the snapshot through", () => {
    const { sdk, emit, unsubscribe } = fakeSdk();
    const reads = meterReads(sdk, true);
    const onNext = vi.fn();
    const onError = vi.fn();
    const unsub = reads.onSnapshot({ path: "users/u1/expenses" }, onNext, onError);
    const snap = querySnap(5);
    emit(snap);
    expect(onNext).toHaveBeenCalledWith(snap);
    expect(sdk.onSnapshot.mock.calls[0][2]).toBe(onError);
    expect(readInventory.rows()).toEqual([expect.objectContaining({ key: "users/*/expenses", open: 1, coldReads: 5 })]);
    unsub();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(readInventory.rows()[0].open).toBe(0);
  });

  it("meters the observer and options forms", () => {
    const { sdk, emit } = fakeSdk();
    const reads = meterReads(sdk, true);
    const next = vi.fn();
    const error = vi.fn();
    reads.onSnapshot({ path: "users/u1/accounts" }, { includeMetadataChanges: true }, { next, error });
    emit(querySnap(2, { parent: "users/u1/accounts" }));
    expect(next).toHaveBeenCalledTimes(1);
    expect(sdk.onSnapshot.mock.calls[0][1]).toEqual({ includeMetadataChanges: true });
    expect((sdk.onSnapshot.mock.calls[0][2] as { error: unknown }).error).toBe(error);
    expect(readInventory.rows()).toContainEqual(expect.objectContaining({ key: "users/*/accounts", coldReads: 2 }));
  });

  it("re-keys a query whose path the SDK hides from its first document", () => {
    const { sdk, emit } = fakeSdk();
    meterReads(sdk, true).onSnapshot({}, vi.fn());
    emit(querySnap(4, { parent: "users/u1/incomes" }));
    // reset() keeps listeners earlier tests left open, so look for this row only.
    expect(readInventory.rows()).toContainEqual(expect.objectContaining({ key: "users/*/incomes", coldReads: 4 }));
    expect(readInventory.rows().find((r) => r.key === "unknown")).toBeUndefined();
  });

  it("never lets a metering failure reach the caller", () => {
    const { sdk, emit } = fakeSdk();
    const onNext = vi.fn();
    meterReads(sdk, true).onSnapshot({ path: "users/u1/expenses" }, onNext);
    const hostile = {
      get size() {
        throw new Error("boom");
      },
      docChanges: () => [],
    };
    expect(() => emit(hostile)).not.toThrow();
    expect(onNext.mock.calls[0][0]).toBe(hostile);
  });

  it("meters getDocs and getDoc and returns their results", async () => {
    const { sdk } = fakeSdk();
    const reads = meterReads(sdk, true);
    const docs = await reads.getDocs({ path: "users/u1/categories" });
    const doc = await reads.getDoc({ path: "users/u1/financialSummaries/epf" });
    expect(docs.size).toBe(3);
    expect(doc.exists()).toBe(true);
    expect(readInventory.totals()).toMatchObject({ directGets: 2, directReads: 4 });
  });
});

describe("refPath", () => {
  it("reads public paths, web query internals and native query internals", () => {
    expect(refPath({ path: "users/u1/expenses" })).toBe("users/u1/expenses");
    expect(refPath({ _query: { path: { canonicalString: () => "users/u1/incomes" } } })).toBe("users/u1/incomes");
    expect(refPath({ _query: { path: { canonicalString: () => "" }, collectionGroup: "entries" } })).toBe("entries");
    expect(refPath({ _collectionPath: { relativeName: "users/u1/accounts" } })).toBe("users/u1/accounts");
    expect(refPath({})).toBeNull();
    expect(refPath(null)).toBeNull();
  });
});

describe("sdkExport", () => {
  it("returns undefined when a mock module throws on a missing export", () => {
    const mocked = new Proxy({ onSnapshot: 1 }, {
      get(target, key) {
        if (key in target) return target[key as "onSnapshot"];
        throw new Error("[vitest] No export is defined on the mock");
      },
    });
    expect(sdkExport(mocked, "onSnapshot")).toBe(1);
    expect(sdkExport(mocked as unknown as Record<string, unknown>, "getDoc")).toBeUndefined();
  });
});
