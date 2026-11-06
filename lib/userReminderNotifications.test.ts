import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  platform: { OS: "android" as string },
  getAllScheduled: vi.fn(),
  cancelScheduled: vi.fn(),
  getPresented: vi.fn(),
  dismiss: vi.fn(),
  logWarning: vi.fn(),
}));

vi.mock("react-native", () => ({ Platform: m.platform }));
vi.mock("expo-notifications", () => ({
  getAllScheduledNotificationsAsync: m.getAllScheduled,
  cancelScheduledNotificationAsync: m.cancelScheduled,
  getPresentedNotificationsAsync: m.getPresented,
  dismissNotificationAsync: m.dismiss,
}));
vi.mock("@/lib/errors", () => ({ logWarning: m.logWarning }));

import { clearUserReminderNotifications } from "./userReminderNotifications";

const presented = (identifier: string) => ({ request: { identifier } });

beforeEach(() => {
  m.platform.OS = "android";
  m.getAllScheduled.mockReset().mockResolvedValue([]);
  m.cancelScheduled.mockReset().mockResolvedValue(undefined);
  m.getPresented.mockReset().mockResolvedValue([]);
  m.dismiss.mockReset().mockResolvedValue(undefined);
  m.logWarning.mockReset();
});

describe("clearUserReminderNotifications", () => {
  it("cancels only the user's scheduled bill, calendar and goal reminders", async () => {
    m.getAllScheduled.mockResolvedValue([
      { identifier: "ccbill:b1:due" },
      { identifier: "cal:reminder:r1:2026-11-06:before" },
      { identifier: "goal:g1:scheduled:2026-11-07" },
      { identifier: "ganesh:seva:1" },
      { identifier: "some-other-id" },
    ]);

    const result = await clearUserReminderNotifications();

    expect(m.cancelScheduled.mock.calls.map((c) => c[0])).toEqual([
      "ccbill:b1:due",
      "cal:reminder:r1:2026-11-06:before",
      "goal:g1:scheduled:2026-11-07",
    ]);
    expect(result.cancelled).toBe(3);
  });

  it("removes the user's reminders already showing in the tray, and nothing else", async () => {
    m.getPresented.mockResolvedValue([presented("ccbill:b1:before:3"), presented("nutrition:meal"), { request: {} }]);

    const result = await clearUserReminderNotifications();

    expect(m.dismiss.mock.calls.map((c) => c[0])).toEqual(["ccbill:b1:before:3"]);
    expect(result.dismissed).toBe(1);
  });

  it("does nothing on web", async () => {
    m.platform.OS = "web";

    expect(await clearUserReminderNotifications()).toEqual({ cancelled: 0, dismissed: 0 });
    expect(m.getAllScheduled).not.toHaveBeenCalled();
    expect(m.getPresented).not.toHaveBeenCalled();
  });

  it("never throws: failures are logged as warnings", async () => {
    m.getAllScheduled.mockRejectedValue(new Error("native module missing"));

    await expect(clearUserReminderNotifications()).resolves.toEqual({ cancelled: 0, dismissed: 0 });
    expect(m.logWarning).toHaveBeenCalledWith("userReminderNotifications.clear", expect.any(Error));
  });
});
