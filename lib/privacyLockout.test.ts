import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearActiveLockout,
  clearLockoutAfterSuccess,
  flushPrivacyLockoutWrites,
  forgetPrivacyLockout,
  getFailedAttempts,
  getLockoutUntil,
  hydratePrivacyLockout,
  isLockedOut,
  LOCKOUT_SCHEDULE_MS,
  lockoutDurationFor,
  recordFailedAttempt,
  resetPrivacyLockoutForTests,
} from "@/lib/privacyLockout";
import { privacySession } from "@/lib/privacySession";

const UID = "user-1";

/** Stands in for SecureStore, and survives a simulated restart. */
function memoryStore() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (k: string) => map.get(k) ?? null,
    setItem: async (k: string, v: string) => void map.set(k, v),
    removeItem: async (k: string) => void map.delete(k),
  };
}

let store: ReturnType<typeof memoryStore>;

/** Drop the in-memory mirror but keep the disk, exactly like a force-stop. */
async function simulateRestart(uid = UID) {
  await flushPrivacyLockoutWrites();
  resetPrivacyLockoutForTests(store);
  await hydratePrivacyLockout(uid);
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-20T10:00:00Z"));
  store = memoryStore();
  resetPrivacyLockoutForTests(store);
  await hydratePrivacyLockout(UID);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("backoff schedule", () => {
  it("does not lock out before the fifth failure", () => {
    for (let i = 0; i < 4; i += 1) expect(lockoutDurationFor(i)).toBe(0);
  });

  it("preserves the previous 5-attempt, 30-second behaviour", () => {
    expect(lockoutDurationFor(5)).toBe(30_000);
  });

  it("escalates", () => {
    expect(lockoutDurationFor(6)).toBe(2 * 60_000);
    expect(lockoutDurationFor(7)).toBe(10 * 60_000);
    expect(lockoutDurationFor(8)).toBe(60 * 60_000);
  });

  it("caps at a day", () => {
    const cap = 24 * 60 * 60_000;
    expect(lockoutDurationFor(9)).toBe(cap);
    expect(lockoutDurationFor(50)).toBe(cap);
  });

  it("is monotonic", () => {
    // A later failure must never buy a shorter lockout.
    for (let i = 1; i < 15; i += 1) {
      expect(lockoutDurationFor(i)).toBeGreaterThanOrEqual(lockoutDurationFor(i - 1));
    }
  });

  it("starts where the old hardcoded limit did", () => {
    expect(LOCKOUT_SCHEDULE_MS[0]).toEqual({ atAttempts: 5, durationMs: 30_000 });
  });
});

describe("counting failures", () => {
  it("locks out on the fifth", () => {
    for (let i = 0; i < 4; i += 1) recordFailedAttempt();
    expect(isLockedOut()).toBe(false);
    recordFailedAttempt();
    expect(isLockedOut()).toBe(true);
    expect(getFailedAttempts()).toBe(5);
  });

  it("reports no active lockout once the window passes", () => {
    for (let i = 0; i < 5; i += 1) recordFailedAttempt();
    vi.advanceTimersByTime(30_001);
    expect(isLockedOut()).toBe(false);
    expect(getLockoutUntil()).toBeNull();
  });

  it("escalates on the failure after an expired lockout", () => {
    for (let i = 0; i < 5; i += 1) recordFailedAttempt();
    vi.advanceTimersByTime(30_001);
    clearActiveLockout();
    // The count survived, so this is failure six: two minutes, not thirty
    // seconds. This is the bug the old clearLockout() made impossible to fix.
    const state = recordFailedAttempt();
    expect(state.attempts).toBe(6);
    expect(state.lockoutUntil).toBe(Date.now() + 2 * 60_000);
  });

  it("keeps the attempt count when an expired lockout is retired", () => {
    for (let i = 0; i < 5; i += 1) recordFailedAttempt();
    vi.advanceTimersByTime(30_001);
    clearActiveLockout();
    expect(getFailedAttempts()).toBe(5);
  });

  it("resets everything only on a successful unlock", () => {
    for (let i = 0; i < 6; i += 1) recordFailedAttempt();
    clearLockoutAfterSuccess();
    expect(getFailedAttempts()).toBe(0);
    expect(isLockedOut()).toBe(false);
  });
});

describe("surviving a restart", () => {
  it("remembers failures across a force-stop", async () => {
    // The actual AUTH-04 bypass: five guesses, kill the app, five more.
    for (let i = 0; i < 4; i += 1) recordFailedAttempt();
    await simulateRestart();
    expect(getFailedAttempts()).toBe(4);
    recordFailedAttempt();
    expect(isLockedOut()).toBe(true);
  });

  it("is still locked out after a restart inside the window", async () => {
    for (let i = 0; i < 5; i += 1) recordFailedAttempt();
    await simulateRestart();
    expect(isLockedOut()).toBe(true);
  });

  it("escalates across restarts", async () => {
    for (let i = 0; i < 5; i += 1) recordFailedAttempt();
    await simulateRestart();
    vi.advanceTimersByTime(30_001);
    const state = recordFailedAttempt();
    expect(state.attempts).toBe(6);
  });

  it("starts clean for a uid with no record", async () => {
    for (let i = 0; i < 5; i += 1) recordFailedAttempt();
    await simulateRestart("someone-else");
    expect(getFailedAttempts()).toBe(0);
    expect(isLockedOut()).toBe(false);
  });
});

describe("per-uid isolation", () => {
  it("does not let one account lock another out", async () => {
    for (let i = 0; i < 5; i += 1) recordFailedAttempt();
    await flushPrivacyLockoutWrites();
    await hydratePrivacyLockout("user-2");
    expect(isLockedOut()).toBe(false);

    await hydratePrivacyLockout(UID);
    expect(isLockedOut()).toBe(true);
  });

  it("forgets a single uid on request", async () => {
    for (let i = 0; i < 5; i += 1) recordFailedAttempt();
    await forgetPrivacyLockout(UID);
    expect(getFailedAttempts()).toBe(0);
    await simulateRestart();
    expect(getFailedAttempts()).toBe(0);
  });
});

describe("clock tampering", () => {
  it("restarts the lockout when the clock moves backwards", async () => {
    for (let i = 0; i < 5; i += 1) recordFailedAttempt();
    await flushPrivacyLockoutWrites();

    // Wind the device clock back a year and relaunch.
    vi.setSystemTime(new Date("2025-09-20T10:00:00Z"));
    resetPrivacyLockoutForTests(store);
    await hydratePrivacyLockout(UID);

    expect(isLockedOut()).toBe(true);
    expect(getLockoutUntil()).toBe(Date.now() + 30_000);
  });

  it("still expires normally when the clock is untouched", async () => {
    for (let i = 0; i < 5; i += 1) recordFailedAttempt();
    await simulateRestart();
    vi.advanceTimersByTime(30_001);
    expect(isLockedOut()).toBe(false);
  });
});

describe("privacySession integration", () => {
  it("does not clear the lockout on sign-out", async () => {
    // Reachable from the lock screen's own "Forgot PIN? Sign Out" button, so
    // clearing here would make five failures cost one tap to undo.
    for (let i = 0; i < 5; i += 1) recordFailedAttempt();
    privacySession.clearAll();
    expect(privacySession.getFailedAttempts()).toBe(5);
    expect(privacySession.getLockoutUntil()).not.toBeNull();
  });

  it("still clears the unlocked and duress flags on sign-out", () => {
    privacySession.markUnlocked({ duress: true });
    expect(privacySession.isUnlocked()).toBe(true);
    expect(privacySession.isDuress()).toBe(true);
    privacySession.clearAll();
    expect(privacySession.isUnlocked()).toBe(false);
    expect(privacySession.isDuress()).toBe(false);
  });

  it("resets the counter when a pin works", () => {
    for (let i = 0; i < 3; i += 1) privacySession.recordFailedAttempt();
    privacySession.markUnlocked({ duress: false });
    expect(privacySession.getFailedAttempts()).toBe(0);
  });

  it("notifies subscribers when an attempt is recorded", () => {
    const seen = vi.fn();
    const unsubscribe = privacySession.subscribe(seen);
    privacySession.recordFailedAttempt();
    expect(seen).toHaveBeenCalled();
    unsubscribe();
  });
});
