import { describe, expect, it } from "vitest";

import {
  hasPendingAppShortcut,
  peekPendingAppShortcut,
  resetPendingAppShortcutForTests,
  setPendingAppShortcut,
  takePendingAppShortcut,
} from "./pendingAppShortcut";

describe("pendingAppShortcut", () => {
  it("stores one action and consumes it once", () => {
    resetPendingAppShortcutForTests();
    expect(hasPendingAppShortcut()).toBe(false);

    setPendingAppShortcut({
      id: "expense.add",
      platform: "android",
      launch: "cold",
    });
    expect(hasPendingAppShortcut()).toBe(true);
    expect(peekPendingAppShortcut()?.id).toBe("expense.add");

    expect(takePendingAppShortcut()?.id).toBe("expense.add");
    expect(hasPendingAppShortcut()).toBe(false);
    expect(takePendingAppShortcut()).toBeNull();
  });

  it("replaces a stale pending action when the same shortcut is tapped again", () => {
    resetPendingAppShortcutForTests();
    setPendingAppShortcut({
      id: "expense.add",
      platform: "ios",
      launch: "cold",
    });
    setPendingAppShortcut({
      id: "accounts.open",
      platform: "ios",
      launch: "warm",
    });
    expect(peekPendingAppShortcut()).toEqual({
      id: "accounts.open",
      platform: "ios",
      launch: "warm",
    });
    resetPendingAppShortcutForTests();
  });
});
