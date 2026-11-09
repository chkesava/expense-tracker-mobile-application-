import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { localReminderSourcesEnabled } from "./reminderMode";

/**
 * SPENDLY-746 (epic SPENDLY-735): in push mode the phone neither schedules
 * local reminders nor keeps listeners for them; the local fallback still works
 * without push. PUSH_DEVELOPER_GUIDE: no duplicates, local reminders stand down.
 */

const ROOT = join(__dirname, "..", "..", "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8").replace(/\r\n/g, "\n");

describe("local reminder sources (SPENDLY-746)", () => {
  it("load only once the mode is known and local", () => {
    expect(localReminderSourcesEnabled({ mode: "local", loading: false })).toBe(true);
    expect(localReminderSourcesEnabled({ mode: "push", loading: false })).toBe(false);
    expect(localReminderSourcesEnabled({ mode: "local", loading: true })).toBe(false);
    expect(localReminderSourcesEnabled({ mode: "push", loading: true })).toBe(false);
  });

  it("the calendar sync opens no reminders listener of its own and registers its loan listeners only in local mode", () => {
    const sync = read("components", "calendar", "CalendarNotificationSync.tsx");
    expect(sync).not.toMatch(/useCalendarReminders\(/);
    expect(sync).toMatch(/useRemindersInbox\(\)/);
    expect(sync).toMatch(/useBorrowings\(\{ enabled: Boolean\(prefs\.duesEnabled\) && local \}\)/);
    expect(sync).toMatch(/useReceivables\(\{ enabled: Boolean\(prefs\.duesEnabled\) && local \}\)/);
    // Push mode still cancels, so the phone never shows both.
    expect(sync).toMatch(/mode === "push"\) void cancelCalendarNotifications\(\)/);
  });

  it("the goal sync subscribes to goals only in local mode, and still cancels in push mode", () => {
    const sync = read("components", "goals", "GoalReminderSync.tsx");
    expect(sync).toMatch(/useFinancialGoals\(\{ enabled: ready && saveGoals && local \}\)/);
    expect(sync).toMatch(/mode === "push"\) void cancelGoalNotifications\(\)/);
  });

  it("the inbox shares its calendar reminders with the sync", () => {
    const inbox = read("providers", "RemindersInboxProvider.tsx");
    expect(inbox).toMatch(/calendarReminders: reminders, calendarRemindersReady/);
  });
});
