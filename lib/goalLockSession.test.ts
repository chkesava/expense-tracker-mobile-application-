import { describe, expect, it, vi } from "vitest";

let appStateHandler: ((state: string) => void) | null = null;
vi.mock("react-native", () => ({
  AppState: { addEventListener: (_: string, cb: (state: string) => void) => { appStateHandler = cb; return { remove: () => undefined }; } },
}));

import { goalLockSession } from "./goalLockSession";

describe("goalLockSession (SPENDLY-614)", () => {
  it("unlocks per goal and forgets every unlock when the app leaves the foreground", () => {
    goalLockSession.lockAll();
    const listener = vi.fn();
    const off = goalLockSession.subscribe(listener);
    goalLockSession.unlock("g1");
    expect(goalLockSession.isUnlocked("g1")).toBe(true);
    expect(goalLockSession.isUnlocked("g2")).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    // Unlocking twice doesn't notify again.
    goalLockSession.unlock("g1");
    expect(listener).toHaveBeenCalledTimes(1);
    appStateHandler?.("background");
    expect(goalLockSession.isUnlocked("g1")).toBe(false);
    off();
  });

  it("keeps the same snapshot object until something changes (stable for useSyncExternalStore)", () => {
    goalLockSession.lockAll();
    const a = goalLockSession.snapshot();
    expect(goalLockSession.snapshot()).toBe(a);
    goalLockSession.unlock("x");
    expect(goalLockSession.snapshot()).not.toBe(a);
  });
});
