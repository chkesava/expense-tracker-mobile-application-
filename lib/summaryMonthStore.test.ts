import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", () => ({ doc: vi.fn(), onSnapshot: vi.fn() }));
vi.mock("@/lib/firebase", () => ({ getFirestoreDb: () => null }));
vi.mock("@/lib/firestoreReadDebug", () => ({ logDirectRead: vi.fn() }));
vi.mock("@/lib/errors", () => ({ logWarning: vi.fn() }));

import { createSummaryMonthStore, type SubscribeMonth } from "./summaryMonthStore";

/** PR #239 review — each month's summary is read once and shared. */
function harness(graceMs = 1000) {
  const subscribed: string[] = [];
  const unsubscribed: string[] = [];
  const push = new Map<string, Parameters<SubscribeMonth>[2]>();
  const fail = new Map<string, Parameters<SubscribeMonth>[3]>();
  const store = createSummaryMonthStore((uid, month, onData, onError) => {
    subscribed.push(`${uid}|${month}`);
    push.set(`${uid}|${month}`, onData);
    fail.set(`${uid}|${month}`, onError);
    return () => unsubscribed.push(`${uid}|${month}`);
  }, { graceMs });
  return { store, subscribed, unsubscribed, push, fail };
}

const summary = (period: string, totalExpenses = 100) =>
  ({ period, totalExpenses, totalIncome: 0, categoryTotals: {}, transactionCount: 1, summaryVersion: 1, calculatedAt: "" });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("per-month summary store (PR #239 review)", () => {
  it("one listener per month, shared by every screen and window", () => {
    const { store, subscribed } = harness();
    store.acquire("u1", ["2026-10", "2026-09", "2026-08"]);
    store.acquire("u1", ["2026-10", "2026-09"]); // another screen, same months
    store.acquire("u1", ["2026-09", "2026-08", "2026-07"]); // previous month: one new month
    expect(subscribed).toEqual(["u1|2026-10", "u1|2026-09", "u1|2026-08", "u1|2026-07"]);
  });

  it("keeps a month live for the grace period after the last screen leaves, then stops it", () => {
    const { store, subscribed, unsubscribed } = harness(1000);
    const release = store.acquire("u1", ["2026-10"]);
    release();
    vi.advanceTimersByTime(500);
    const again = store.acquire("u1", ["2026-10"]); // back within the grace: no re-read
    expect(subscribed).toEqual(["u1|2026-10"]);
    again();
    vi.advanceTimersByTime(1000);
    expect(unsubscribed).toEqual(["u1|2026-10"]);
    store.acquire("u1", ["2026-10"]); // after the grace: a fresh listener
    expect(subscribed).toEqual(["u1|2026-10", "u1|2026-10"]);
  });

  it("a month still used by another screen isn't stopped", () => {
    const { store, unsubscribed } = harness(1000);
    const a = store.acquire("u1", ["2026-10"]);
    store.acquire("u1", ["2026-10"]);
    a();
    vi.advanceTimersByTime(5000);
    expect(unsubscribed).toEqual([]);
  });

  it("reports loading, then the data or a missing month, and errors; every change bumps the version", () => {
    const { store, push, fail } = harness();
    store.acquire("u1", ["2026-10", "2026-09", "2026-08"]);
    expect(store.get("u1", "2026-10")?.status).toBe("loading");
    const v0 = store.version();
    push.get("u1|2026-10")!(summary("2026-10"));
    push.get("u1|2026-09")!(null); // no summary doc: no spending recorded
    fail.get("u1|2026-08")!({ message: "denied" } as never);
    expect(store.version()).toBe(v0 + 3);
    expect(store.get("u1", "2026-10")).toMatchObject({ status: "ready", summary: { period: "2026-10" } });
    expect(store.get("u1", "2026-09")).toMatchObject({ status: "ready", summary: null });
    expect(store.get("u1", "2026-08")).toMatchObject({ status: "error", error: { message: "denied" } });
    // A later change (a backdated edit) arrives on the same live listener.
    push.get("u1|2026-10")!(summary("2026-10", 250));
    expect(store.get("u1", "2026-10")?.summary?.totalExpenses).toBe(250);
  });

  it("a month whose listener failed is restarted when a screen next needs it, keeping the last figure (PR #239 review)", () => {
    const { store, subscribed, unsubscribed, push, fail } = harness();
    store.acquire("u1", ["2026-10"]);
    push.get("u1|2026-10")!(summary("2026-10", 120));
    fail.get("u1|2026-10")!({ message: "permission-denied" } as never);
    expect(store.get("u1", "2026-10")).toMatchObject({ status: "error" });
    store.acquire("u1", ["2026-10"]); // the next screen (or the same one after navigating)
    expect(subscribed).toEqual(["u1|2026-10", "u1|2026-10"]);
    expect(unsubscribed).toEqual(["u1|2026-10"]);
    expect(store.get("u1", "2026-10")).toMatchObject({ status: "loading", summary: { totalExpenses: 120 }, error: null });
    push.get("u1|2026-10")!(summary("2026-10", 130));
    expect(store.get("u1", "2026-10")).toMatchObject({ status: "ready", summary: { totalExpenses: 130 } });
  });

  it("another user's sign-in stops every listener of the previous one", () => {
    const { store, unsubscribed, subscribed } = harness();
    store.acquire("u1", ["2026-10", "2026-09"]);
    store.acquire("u2", ["2026-10"]);
    expect(unsubscribed.sort()).toEqual(["u1|2026-09", "u1|2026-10"]);
    expect(subscribed.at(-1)).toBe("u2|2026-10");
    expect(store.get("u1", "2026-10")).toBeUndefined();
  });
});
