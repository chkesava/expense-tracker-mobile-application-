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
      expect(privacySession.recordFailedAttempt()).toEqual({
        attempts: i,
        lockedOut: false,
      });
    }

    const locked = privacySession.recordFailedAttempt();
    expect(locked).toEqual({ attempts: 5, lockedOut: true });
    expect(privacySession.getLockoutUntil()).toBe(Date.now() + 30_000);

    privacySession.clearLockout();
    expect(privacySession.getFailedAttempts()).toBe(0);
    expect(privacySession.getLockoutUntil()).toBeNull();
  });

  it("clearAll resets unlocked/duress/attempts (logout path)", () => {
    privacySession.markUnlocked({ duress: true });
    privacySession.recordFailedAttempt();
    privacySession.clearAll();
    expect(privacySession.isUnlocked()).toBe(false);
    expect(privacySession.isDuress()).toBe(false);
    expect(privacySession.getFailedAttempts()).toBe(0);
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
