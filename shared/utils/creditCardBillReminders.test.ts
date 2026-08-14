import { describe, expect, it } from "vitest";

import { DEFAULT_CREDIT_CARD_BILL_REMINDERS } from "../types/creditCardBill";
import {
  addDaysToDateKey,
  applyQuietHours,
  buildReminderSlots,
  computeNextReminderAt,
  stableReminderNotificationId,
} from "./creditCardBillReminders";

describe("addDaysToDateKey", () => {
  it("adds and subtracts days", () => {
    expect(addDaysToDateKey("2026-08-21", -7)).toBe("2026-08-14");
    expect(addDaysToDateKey("2026-08-21", 1)).toBe("2026-08-22");
  });
});

describe("buildReminderSlots", () => {
  it("builds pre-due and overdue slots from today forward", () => {
    const slots = buildReminderSlots(
      "2026-08-21",
      { daysBefore: [7, 3, 1], onDueDate: true, overdueEveryDays: 1 },
      "2026-08-14",
      3
    );
    expect(slots.some((s) => s.kind === "days_before" && s.daysBefore === 7)).toBe(
      true
    );
    expect(slots.some((s) => s.kind === "due_date")).toBe(true);
    expect(slots.filter((s) => s.kind === "overdue")).toHaveLength(3);
  });
});

describe("computeNextReminderAt", () => {
  it("returns null when bill is paid", () => {
    const next = computeNextReminderAt({
      bill: {
        dueDate: "2026-08-21",
        status: "PAID",
        remainingAmount: 0,
        reminderEnabled: true,
        reminderFrequency: {
          daysBefore: [7, 3, 1],
          onDueDate: true,
          overdueEveryDays: 1,
        },
      },
      today: "2026-08-14",
      globalPrefs: DEFAULT_CREDIT_CARD_BILL_REMINDERS,
    });
    expect(next).toBeNull();
  });

  it("returns next upcoming slot", () => {
    const next = computeNextReminderAt({
      bill: {
        dueDate: "2026-08-21",
        status: "UPCOMING",
        remainingAmount: 8450,
        reminderEnabled: true,
        reminderFrequency: {
          daysBefore: [7, 3, 1],
          onDueDate: true,
          overdueEveryDays: 1,
        },
      },
      today: "2026-08-14",
      globalPrefs: DEFAULT_CREDIT_CARD_BILL_REMINDERS,
    });
    expect(next).toBe("2026-08-14");
  });

  it("continues after partial payment", () => {
    const next = computeNextReminderAt({
      bill: {
        dueDate: "2026-08-21",
        status: "PARTIALLY_PAID",
        remainingAmount: 4000,
        reminderEnabled: true,
        reminderFrequency: {
          daysBefore: [7, 3, 1],
          onDueDate: true,
          overdueEveryDays: 2,
        },
        lastReminderSentAt: "2026-08-22T10:00:00.000Z",
      },
      today: "2026-08-23",
      globalPrefs: DEFAULT_CREDIT_CARD_BILL_REMINDERS,
    });
    expect(next).toBe("2026-08-23");
  });
});

describe("applyQuietHours", () => {
  it("clamps before and after window", () => {
    expect(applyQuietHours(6, 0, "08:00", "21:00")).toEqual({
      hour: 8,
      minute: 0,
    });
    expect(applyQuietHours(22, 30, "08:00", "21:00")).toEqual({
      hour: 21,
      minute: 0,
    });
    expect(applyQuietHours(12, 15, "08:00", "21:00")).toEqual({
      hour: 12,
      minute: 15,
    });
  });
});

describe("stableReminderNotificationId", () => {
  it("is stable per slot", () => {
    expect(
      stableReminderNotificationId("b1", {
        kind: "days_before",
        daysBefore: 7,
        dateKey: "2026-08-14",
      })
    ).toBe("ccbill:b1:before:7");
  });
});
