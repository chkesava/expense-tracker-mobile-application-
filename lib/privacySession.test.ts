import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { privacySession } from "./privacySession";

describe("privacySession", () => {
  beforeEach(() => {
    privacySession.clearAll();
    vi.useRealTimers();
  });

  afterEach(() => {
    privacySession.clearAll();
    vi.useRealTimers();
  });

  it("starts locked with no duress and zero failed attempts", () => {
    expect(privacySession.isUnlocked()).toBe(false);
    expect(privacySession.isDuress()).toBe(false);
    expect(privacySession.getFailedAttempts()).toBe(0);
    expect(privacySession.getLockoutUntil()).toBeNull();
  });

  it("marks a real unlock and clears attempt/lockout state", () => {
    privacySession.recordFailedAttempt();
    privacySession.markUnlocked({ duress: false });
    expect(privacySession.isUnlocked()).toBe(true);
    expect(privacySession.isDuress()).toBe(false);
    expect(privacySession.getFailedAttempts()).toBe(0);
    expect(privacySession.getLockoutUntil()).toBeNull();
  });

  it("marks duress unlock and keeps duress after lock()", () => {
    privacySession.markUnlocked({ duress: true });
    expect(privacySession.isUnlocked()).toBe(true);
    expect(privacySession.isDuress()).toBe(true);

    privacySession.lock();
    expect(privacySession.isUnlocked()).toBe(false);
    expect(privacySession.isDuress()).toBe(true);
  });

  it("clears duress on a subsequent real unlock", () => {
    privacySession.markUnlocked({ duress: true });
    privacySession.lock();
    privacySession.markUnlocked({ duress: false });
    expect(privacySession.isDuress()).toBe(false);
    expect(privacySession.isUnlocked()).toBe(true);
  });

  it("locks out after 5 failed attempts for 30 seconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T12:00:00.000Z"));

    for (let i = 1; i <= 4; i += 1) {
      const state = privacySession.recordFailedAttempt();
      expect(state.attempts).toBe(i);
      expect(state.lockedOut).toBe(false);
    }

    const locked = privacySession.recordFailedAttempt();
    expect(locked.attempts).toBe(5);
    expect(locked.lockedOut).toBe(true);
    expect(privacySession.getLockoutUntil()).toBe(Date.now() + 30_000);

    // SPENDLY-22: retiring an expired lockout keeps the count, so the next
    // failure escalates. Only a working PIN forgives it — see
    // `lib/privacyLockout.test.ts`.
    privacySession.clearLockout();
    expect(privacySession.getFailedAttempts()).toBe(5);
    expect(privacySession.getLockoutUntil()).toBeNull();

    privacySession.markUnlocked({ duress: false });
    expect(privacySession.getFailedAttempts()).toBe(0);
  });

  it("clearAll resets unlocked/duress but not the lockout (logout path)", () => {
    // SPENDLY-22: the lock screen's own "Forgot PIN? Sign Out" reaches this,
    // so clearing the counter here would be a one-tap lockout reset.
    privacySession.markUnlocked({ duress: true });
    privacySession.recordFailedAttempt();
    privacySession.clearAll();
    expect(privacySession.isUnlocked()).toBe(false);
    expect(privacySession.isDuress()).toBe(false);
    expect(privacySession.getFailedAttempts()).toBe(1);
  });

  it("notifies subscribers on state changes and supports unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = privacySession.subscribe(listener);

    privacySession.markUnlocked({ duress: false });
    expect(listener.mock.calls.length).toBeGreaterThan(0);

    const callsAfterUnlock = listener.mock.calls.length;
    unsubscribe();
    privacySession.lock();
    expect(listener.mock.calls.length).toBe(callsAfterUnlock);
  });
});
