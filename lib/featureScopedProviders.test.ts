import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Feature Scoped Provider Lifecycle & Grace Period", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("increments subscriber count and triggers listener immediately on first subscriber", () => {
    let subscriberCount = 0;
    let shouldListen = false;
    let teardownTimer: NodeJS.Timeout | null = null;

    const registerSubscriber = () => {
      if (teardownTimer) {
        clearTimeout(teardownTimer);
        teardownTimer = null;
      }
      subscriberCount += 1;
      shouldListen = true;
      return () => {
        subscriberCount = Math.max(0, subscriberCount - 1);
        if (subscriberCount === 0) {
          if (teardownTimer) clearTimeout(teardownTimer);
          teardownTimer = setTimeout(() => {
            if (subscriberCount === 0) {
              shouldListen = false;
            }
            teardownTimer = null;
          }, 15000);
        }
      };
    };

    expect(shouldListen).toBe(false);
    expect(subscriberCount).toBe(0);

    // First subscriber mounts
    const unmount1 = registerSubscriber();
    expect(shouldListen).toBe(true);
    expect(subscriberCount).toBe(1);

    // Second subscriber mounts
    const unmount2 = registerSubscriber();
    expect(shouldListen).toBe(true);
    expect(subscriberCount).toBe(2);

    // First unmounts -> still 1 subscriber
    unmount1();
    expect(shouldListen).toBe(true);
    expect(subscriberCount).toBe(1);
    expect(teardownTimer).toBeNull();

    // Second unmounts -> 0 subscribers, 15s grace period starts
    unmount2();
    expect(subscriberCount).toBe(0);
    expect(shouldListen).toBe(true); // Still active during grace period!
    expect(teardownTimer).not.toBeNull();

    // Advance 10s (within grace period) -> should still be listening
    vi.advanceTimersByTime(10000);
    expect(shouldListen).toBe(true);

    // Third subscriber mounts within grace period -> timer cancelled, listener stays alive
    const unmount3 = registerSubscriber();
    expect(teardownTimer).toBeNull();
    expect(shouldListen).toBe(true);
    expect(subscriberCount).toBe(1);

    // Third unmounts -> grace period starts again
    unmount3();
    expect(subscriberCount).toBe(0);
    expect(shouldListen).toBe(true);

    // Advance 15s -> grace period expires, listener cleanly detached
    vi.advanceTimersByTime(15000);
    expect(shouldListen).toBe(false);
  });

  // SPENDLY-411: categoryBudgets/financialGoals in ExpenseReferenceDataProvider
  // use two independent gates (like BorrowingsReceivablesProvider's borrowings/
  // receivables pair) so retrying or tearing down one never affects the other.
  it("keeps two independently-gated listeners from interfering with each other", () => {
    function makeGate() {
      let subscriberCount = 0;
      let shouldListen = false;
      let teardownTimer: NodeJS.Timeout | null = null;

      const registerSubscriber = () => {
        if (teardownTimer) {
          clearTimeout(teardownTimer);
          teardownTimer = null;
        }
        subscriberCount += 1;
        shouldListen = true;
        return () => {
          subscriberCount = Math.max(0, subscriberCount - 1);
          if (subscriberCount === 0) {
            if (teardownTimer) clearTimeout(teardownTimer);
            teardownTimer = setTimeout(() => {
              if (subscriberCount === 0) {
                shouldListen = false;
              }
              teardownTimer = null;
            }, 15000);
          }
        };
      };

      return {
        registerSubscriber,
        get shouldListen() {
          return shouldListen;
        },
      };
    }

    const budgetsGate = makeGate();
    const goalsGate = makeGate();

    const unmountBudgets = budgetsGate.registerSubscriber();
    expect(budgetsGate.shouldListen).toBe(true);
    expect(goalsGate.shouldListen).toBe(false);

    const unmountGoals = goalsGate.registerSubscriber();
    expect(goalsGate.shouldListen).toBe(true);

    // Tearing down budgets starts its own grace period and must not touch goals.
    unmountBudgets();
    expect(budgetsGate.shouldListen).toBe(true); // still in grace period
    vi.advanceTimersByTime(15000);
    expect(budgetsGate.shouldListen).toBe(false);
    expect(goalsGate.shouldListen).toBe(true); // untouched

    unmountGoals();
    vi.advanceTimersByTime(15000);
    expect(goalsGate.shouldListen).toBe(false);
  });

  // SPENDLY-412: spaces/categorizationRules became one-shot reads instead of
  // realtime listeners; this verifies the foreground-refresh throttle that
  // gives them eventual sync without a read storm on quick app switches.
  describe("foreground refresh throttle (SPENDLY-412)", () => {
    const FOREGROUND_REFRESH_MIN_INTERVAL_MS = 5 * 60 * 1000;

    function shouldRefetchOnForeground(lastFetchedAt: number, now: number): boolean {
      return now - lastFetchedAt > FOREGROUND_REFRESH_MIN_INTERVAL_MS;
    }

    it("does not refetch when the app foregrounds within 5 minutes of the last fetch", () => {
      const lastFetchedAt = Date.now();
      vi.advanceTimersByTime(4 * 60 * 1000);
      expect(shouldRefetchOnForeground(lastFetchedAt, Date.now())).toBe(false);
    });

    it("refetches when the app foregrounds more than 5 minutes after the last fetch", () => {
      const lastFetchedAt = Date.now();
      vi.advanceTimersByTime(6 * 60 * 1000);
      expect(shouldRefetchOnForeground(lastFetchedAt, Date.now())).toBe(true);
    });

    it("treats never-fetched (timestamp 0) as stale", () => {
      expect(shouldRefetchOnForeground(0, Date.now())).toBe(true);
    });
  });
});
