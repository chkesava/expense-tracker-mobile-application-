import { describe, expect, it } from "vitest";

import { CALENDAR_NOTIFICATION_PREFIX } from "./calendarNotifications";
import { stableReminderNotificationId } from "./creditCardBillReminders";
import { GOAL_NOTIFICATION_PREFIX } from "./goalReminders";
import {
  USER_REMINDER_NOTIFICATION_PREFIXES,
  isUserReminderNotificationId,
} from "./userReminderNotifications";

describe("isUserReminderNotificationId", () => {
  it("matches every bill reminder id the scheduler builds", () => {
    expect(isUserReminderNotificationId(stableReminderNotificationId("b1", { kind: "days_before", daysBefore: 3 } as never))).toBe(true);
    expect(isUserReminderNotificationId(stableReminderNotificationId("b1", { kind: "due_date" } as never))).toBe(true);
    expect(
      isUserReminderNotificationId(stableReminderNotificationId("b1", { kind: "overdue", dateKey: "2026-11-06" } as never))
    ).toBe(true);
  });

  it("matches calendar and goal reminder ids", () => {
    expect(isUserReminderNotificationId(`${CALENDAR_NOTIFICATION_PREFIX}reminder:r1:2026-11-06:due`)).toBe(true);
    expect(isUserReminderNotificationId(`${GOAL_NOTIFICATION_PREFIX}g1:scheduled:2026-11-06`)).toBe(true);
    expect(isUserReminderNotificationId(`${GOAL_NOTIFICATION_PREFIX}g1:inactivity:2026-11-06`)).toBe(true);
  });

  it("leaves other notifications alone", () => {
    for (const id of ["", "sms:123", "ganesh:seva:1", "nutrition:meal", "price-alert:1", "calendar:x", "goals:x", "xccbill:1"]) {
      expect(isUserReminderNotificationId(id)).toBe(false);
    }
  });

  it("rejects non-string identifiers", () => {
    for (const id of [undefined, null, 42, {}]) {
      expect(isUserReminderNotificationId(id)).toBe(false);
    }
  });

  it("covers exactly the three Spendly reminder kinds", () => {
    expect([...USER_REMINDER_NOTIFICATION_PREFIXES].sort()).toEqual(["cal:", "ccbill:", "goal:"]);
  });
});
