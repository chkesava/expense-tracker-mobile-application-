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
});
