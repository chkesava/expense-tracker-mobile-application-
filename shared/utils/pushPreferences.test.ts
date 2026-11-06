import { describe, expect, it } from "vitest";

import {
  DEFAULT_DELIVERY_WINDOW,
  DEFAULT_PUSH_NOTIFICATIONS,
  PUSH_CHANNELS,
  crossesMidnight,
  isPushCategoryEnabled,
  isWithinDeliveryWindow,
  parsePushNotificationSettings,
  resolveDeliveryWindow,
} from "./pushPreferences";

describe("parsePushNotificationSettings", () => {
  it("defaults: every event category on, no saved window, amounts hidden", () => {
    expect(parsePushNotificationSettings(undefined)).toEqual(DEFAULT_PUSH_NOTIFICATIONS);
    expect(DEFAULT_PUSH_NOTIFICATIONS.showAmounts).toBe(false);
  });

  it("keeps valid values and drops bad ones", () => {
    expect(
      parsePushNotificationSettings({
        categories: { investments: false, shared: "yes", priceAlerts: true },
        deliveryWindow: { start: "22:00", end: "07:00" },
        showAmounts: true,
      })
    ).toEqual({
      categories: { investments: false, shared: true, priceAlerts: true },
      deliveryWindow: { start: "22:00", end: "07:00" },
      showAmounts: true,
    });
    expect(parsePushNotificationSettings({ deliveryWindow: { start: "25:00", end: "07:00" } }).deliveryWindow).toBeNull();
    expect(parsePushNotificationSettings({ deliveryWindow: { start: "09:00", end: "09:00" } }).deliveryWindow).toBeNull();
  });
});

describe("resolveDeliveryWindow", () => {
  it("prefers the saved window, then the bill quiet hours, then the calendar's, then the default", () => {
    const bills = { quietHoursStart: "07:00", quietHoursEnd: "22:00" };
    const cal = { quietHoursStart: "09:00", quietHoursEnd: "20:00" };
    const saved = { ...DEFAULT_PUSH_NOTIFICATIONS, deliveryWindow: { start: "10:00", end: "18:00" } };

    expect(resolveDeliveryWindow({ pushNotifications: saved, creditCardBillReminders: bills, calendarNotifications: cal })).toEqual({ start: "10:00", end: "18:00" });
    expect(resolveDeliveryWindow({ pushNotifications: DEFAULT_PUSH_NOTIFICATIONS, creditCardBillReminders: bills, calendarNotifications: cal })).toEqual({ start: "07:00", end: "22:00" });
    expect(resolveDeliveryWindow({ calendarNotifications: cal })).toEqual({ start: "09:00", end: "20:00" });
    expect(resolveDeliveryWindow({})).toEqual(DEFAULT_DELIVERY_WINDOW);
  });
});

describe("isWithinDeliveryWindow", () => {
  it("handles a daytime window (end exclusive)", () => {
    const w = { start: "08:00", end: "21:00" };
    expect(crossesMidnight(w)).toBe(false);
    expect(isWithinDeliveryWindow(w, "08:00")).toBe(true);
    expect(isWithinDeliveryWindow(w, "20:59")).toBe(true);
    expect(isWithinDeliveryWindow(w, "21:00")).toBe(false);
    expect(isWithinDeliveryWindow(w, "07:59")).toBe(false);
  });

  it("handles a window that crosses midnight", () => {
    const w = { start: "22:00", end: "07:00" };
    expect(crossesMidnight(w)).toBe(true);
    expect(isWithinDeliveryWindow(w, "23:30")).toBe(true);
    expect(isWithinDeliveryWindow(w, "00:00")).toBe(true);
    expect(isWithinDeliveryWindow(w, "06:59")).toBe(true);
    expect(isWithinDeliveryWindow(w, "07:00")).toBe(false);
    expect(isWithinDeliveryWindow(w, "12:00")).toBe(false);
  });

  it("rejects a malformed time", () => {
    expect(isWithinDeliveryWindow(DEFAULT_DELIVERY_WINDOW, "9am")).toBe(false);
  });
});

describe("isPushCategoryEnabled", () => {
  it("reuses the existing reminder switches", () => {
    expect(isPushCategoryEnabled({ creditCardBillReminders: { enabled: false } }, "bills")).toBe(false);
    expect(isPushCategoryEnabled({ creditCardBillReminders: { enabled: true } }, "bills")).toBe(true);
    expect(isPushCategoryEnabled({ calendarNotifications: { remindersEnabled: false } }, "calendar")).toBe(false);
    // Dues stay off unless switched on, as today.
    expect(isPushCategoryEnabled({}, "dues")).toBe(false);
    expect(isPushCategoryEnabled({ calendarNotifications: { duesEnabled: true } }, "dues")).toBe(true);
    expect(isPushCategoryEnabled({}, "goals")).toBe(true);
  });

  it("reads the new event switches, on by default", () => {
    expect(isPushCategoryEnabled({}, "investments")).toBe(true);
    const off = { ...DEFAULT_PUSH_NOTIFICATIONS, categories: { investments: false, shared: true, priceAlerts: false } };
    expect(isPushCategoryEnabled({ pushNotifications: off }, "investments")).toBe(false);
    expect(isPushCategoryEnabled({ pushNotifications: off }, "shared")).toBe(true);
    expect(isPushCategoryEnabled({ pushNotifications: off }, "priceAlerts")).toBe(false);
  });
});

describe("PUSH_CHANNELS", () => {
  it("keeps the channel ids the local reminders already use", () => {
    expect(PUSH_CHANNELS.bills.id).toBe("credit-card-bills");
    expect(PUSH_CHANNELS.calendar.id).toBe("financial-calendar");
    expect(PUSH_CHANNELS.goals.id).toBe("savings-goals");
  });

  it("gives every category a channel, sharing one only between calendar and dues", () => {
    const ids = Object.entries(PUSH_CHANNELS).map(([, c]) => c.id);
    expect(new Set(ids).size).toBe(ids.length - 1);
  });
});
