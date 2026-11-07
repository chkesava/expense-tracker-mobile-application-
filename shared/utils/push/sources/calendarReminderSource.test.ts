import { describe, expect, it } from "vitest";

import { SETTINGS_DEFAULTS, type UserSettings } from "../../../types/settings";
import { runReminderTick } from "../reminderEngine";
import { fakeAdminDb, memoryPushPorts } from "../testing/fakeAdminDb";
import { createCalendarReminderSource, toReminder, type ReminderItem } from "./calendarReminderSource";

const TODAY = "2026-11-06";

const settings = (over: Partial<UserSettings> = {}): UserSettings => ({
  ...SETTINGS_DEFAULTS,
  timezone: "Asia/Kolkata",
  pushNotifications: { ...SETTINGS_DEFAULTS.pushNotifications, deliveryWindow: { start: "08:00", end: "21:00" } },
  ...over,
});

const reminderData = (over: Record<string, unknown> = {}) => ({
  title: "Pay car insurance",
  startDate: "2026-11-09",
  category: "insurance",
  recurrence: "none",
  remindDaysBefore: 3,
  completedDates: [],
  estimatedAmount: 14500,
  createdAtMs: 1,
  updatedAtMs: 1,
  ...over,
});
const item = (over: Record<string, unknown> = {}, id = "r1"): ReminderItem => ({ uid: "u1", reminder: toReminder(id, reminderData(over)) });

const source = createCalendarReminderSource(fakeAdminDb({}).db);
const slots = (it: ReminderItem, s = settings(), today = TODAY) => source.slotsFor(it, { today, settings: s });

describe("calendar reminder slots", () => {
  it("notifies the reminder's lead days before, without the amount by default", () => {
    expect(slots(item())).toEqual([
      {
        slotId: "cal:reminder:r1:2026-11-09:before",
        date: TODAY,
        time: "09:00",
        kind: "calendar_before",
        title: "Reminder: Pay car insurance",
        body: "Due in 3 days",
        url: "/calendar?focus=reminder%3Ar1%3A2026-11-09&date=2026-11-09",
      },
    ]);
  });

  it("uses the reminder's own time on the day, and shows the amount when allowed", () => {
    const s = settings({ pushNotifications: { ...settings().pushNotifications, showAmounts: true } });
    const [slot] = slots(item({ startDate: TODAY, time: "18:30" }), s);
    expect(slot).toMatchObject({ kind: "calendar_due", time: "18:30" });
    expect(slot.body).toMatch(/^Due today · .*14,500/);
  });

  it("notifies once the day after if not done, at 09:00", () => {
    expect(slots(item({ startDate: "2026-11-05", time: "18:30" }))).toEqual([
      expect.objectContaining({ kind: "calendar_overdue", time: "09:00", title: "Not done yet: Pay car insurance" }),
    ]);
    expect(slots(item({ startDate: "2026-11-04" }))).toEqual([]);
  });

  it("is silent for a done occurrence", () => {
    expect(slots(item({ startDate: TODAY, completedDates: [TODAY] }))).toEqual([]);
    expect(slots(item({ startDate: "2026-11-05", completedDates: ["2026-11-05"] }))).toEqual([]);
  });

  it("follows a recurrence to its open occurrence, and stops after untilDate", () => {
    const monthly = { recurrence: "monthly", startDate: "2026-01-06", remindDaysBefore: 0 };
    expect(slots(item(monthly))[0]).toMatchObject({ slotId: "cal:reminder:r1:2026-11-06:due" });
    expect(slots(item({ ...monthly, completedDates: [TODAY] }))).toEqual([]);
    expect(slots(item({ ...monthly, untilDate: "2026-10-31" }))).toEqual([]);
  });

  it("is silent when My reminders is off", () => {
    const off = settings({ calendarNotifications: { ...SETTINGS_DEFAULTS.calendarNotifications, remindersEnabled: false } });
    expect(slots(item({ startDate: TODAY }), off)).toEqual([]);
  });

  it("a moved date is a different slot", () => {
    const before = slots(item({ startDate: "2026-11-09" }))[0].slotId;
    const moved = slots(item({ startDate: "2026-11-10", remindDaysBefore: 4 }))[0].slotId;
    expect(before).not.toBe(moved);
  });
});

describe("createCalendarReminderSource", () => {
  const seed = () => ({
    "users/u1/calendarReminders/once": reminderData(),
    "users/u1/calendarReminders/longAgo": reminderData({ startDate: "2026-01-01" }),
    "users/u1/calendarReminders/monthly": reminderData({ recurrence: "monthly", startDate: "2025-12-06" }),
    "pandals/p1/calendarReminders/x": reminderData(),
  });

  it("finds recurring reminders and one-time reminders near today, under users/ only", async () => {
    const f = fakeAdminDb(seed());
    const found = await createCalendarReminderSource(f.db).candidates({ fromDate: "2026-11-05", toDate: "2026-11-07" });
    expect(found.map((c) => c.item.reminder.id).sort()).toEqual(["monthly", "once"]);
  });

  it("end to end: a reminder marked done before the send isn't pushed, and a deleted one neither", async () => {
    const f = fakeAdminDb({
      ...seed(),
      "users/u1/calendarReminders/today": reminderData({ startDate: TODAY, remindDaysBefore: 0 }),
      "users/u1/calendarReminders/gone": reminderData({ startDate: TODAY, remindDaysBefore: 0, title: "Gone" }),
    });
    const src = createCalendarReminderSource(f.db);
    const candidates = await src.candidates({ fromDate: "2026-11-05", toDate: "2026-11-07" });
    f.docs.set("users/u1/calendarReminders/today", { ...f.docs.get("users/u1/calendarReminders/today"), completedDates: [TODAY] });
    f.docs.delete("users/u1/calendarReminders/gone");
    const push = memoryPushPorts(["u1"]);
    const res = await runReminderTick(
      [{ ...src, candidates: async () => candidates }],
      { loadSettings: async () => settings(), push: push.ports },
      new Date("2026-11-06T04:00:00Z") // 09:30 IST
    );
    expect(res.skipped).toMatchObject({ resolved: 1, deleted: 1 });
    // "once" (3 days before) and the monthly one (due today) still go out.
    expect(push.sent.map((m) => m.data.entityId).sort()).toEqual(["monthly", "once"]);
  });
});
