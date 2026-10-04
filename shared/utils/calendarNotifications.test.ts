import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "../types/calendar";
import type { CalendarReminder } from "../types/calendarReminder";
import { CALENDAR_NOTIFICATION_CAP, isRoutableNotification, planCalendarNotifications, type CalendarNotificationPrefs } from "./calendarNotifications";

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: `${over.source ?? "borrowing"}:${over.refId ?? "r"}:${over.date ?? "2026-10-20"}`,
  source: "borrowing",
  refId: "r",
  date: "2026-10-20",
  title: "Repay Ravi",
  amount: 5000,
  currency: "INR",
  direction: "out",
  state: "scheduled",
  priority: 1,
  actionable: true,
  href: "/ledger?tab=borrowings&id=r",
  ...over,
});
const reminder = (over: Partial<CalendarReminder> = {}): CalendarReminder => ({
  id: "m1",
  title: "Renew insurance",
  startDate: "2026-10-20",
  category: "insurance",
  recurrence: "none",
  remindDaysBefore: 3,
  completedDates: [],
  createdAtMs: 1,
  updatedAtMs: 1,
  ...over,
});
const prefs = (over: Partial<CalendarNotificationPrefs> = {}): CalendarNotificationPrefs => ({ remindersEnabled: true, duesEnabled: true, duesDaysBefore: 1, ...over });
const plan = (events: CalendarEvent[], over: Partial<CalendarNotificationPrefs> = {}, reminders: CalendarReminder[] = [reminder()]) =>
  planCalendarNotifications({ events, reminders, today: "2026-10-15", prefs: prefs(over), format: (n) => `₹${n}` });

describe("planning", () => {
  it("plans before, due and overdue notices with stable ids", () => {
    const p = plan([ev({})]);
    expect(p.map((n) => [n.id, n.fireDate])).toEqual([
      ["cal:borrowing:r:2026-10-20:before", "2026-10-19"],
      ["cal:borrowing:r:2026-10-20:due", "2026-10-20"],
      ["cal:borrowing:r:2026-10-20:overdue", "2026-10-21"],
    ]);
    expect(p[0]).toMatchObject({ title: "Repay Ravi", body: "Repayment due tomorrow · ₹5000", url: "/calendar?focus=borrowing%3Ar%3A2026-10-20&date=2026-10-20" });
    expect(plan([ev({})])).toEqual(p);
  });

  it("uses each reminder's own lead time", () => {
    const p = plan([ev({ source: "reminder", refId: "m1", id: "reminder:m1:2026-10-20", title: "Renew insurance", amount: null, direction: "neutral" })]);
    expect(p.map((n) => [n.kind, n.fireDate])).toEqual([
      ["before", "2026-10-17"],
      ["due", "2026-10-20"],
      ["overdue", "2026-10-21"],
    ]);
    expect(p[0]).toMatchObject({ title: "Reminder: Renew insurance", body: "Due in 3 days" });
  });

  it("drops completed, cancelled and recorded items, and card bills", () => {
    const p = plan([
      ev({ refId: "done", state: "completed" }),
      ev({ refId: "x", state: "cancelled" }),
      ev({ source: "income", refId: "i", state: "actual", direction: "in" }),
      ev({ source: "card_bill", refId: "b" }),
    ]);
    expect(p).toEqual([]);
  });

  it("never schedules in the past and gives an overdue item one notice the day after", () => {
    const p = plan([ev({ refId: "late", date: "2026-10-14", state: "overdue" })]);
    expect(p.map((n) => [n.kind, n.fireDate])).toEqual([["overdue", "2026-10-15"]]);
    expect(plan([ev({ refId: "older", date: "2026-10-01", state: "overdue" })])).toEqual([]);
  });

  it("respects the switches and the dues lead time", () => {
    expect(plan([ev({})], { duesEnabled: false })).toEqual([]);
    expect(plan([ev({ source: "reminder", refId: "m1" })], { remindersEnabled: false })).toEqual([]);
    expect(plan([ev({})], { duesDaysBefore: 0 }).map((n) => n.kind)).toEqual(["due", "overdue"]);
  });

  it("moves with a rescheduled item instead of duplicating", () => {
    const before = plan([ev({ date: "2026-10-20" })]).map((n) => n.id);
    const after = plan([ev({ date: "2026-10-25" })]).map((n) => n.id);
    expect(after.some((id) => before.includes(id))).toBe(false);
    expect(after).toHaveLength(3);
  });

  it("caps the total, earliest first", () => {
    const many = Array.from({ length: 40 }, (_, i) => ev({ refId: `r${i}`, date: `2026-11-${String((i % 28) + 1).padStart(2, "0")}` }));
    const p = plan(many);
    expect(p).toHaveLength(CALENDAR_NOTIFICATION_CAP);
    expect(p.map((n) => n.fireDate)).toEqual([...p.map((n) => n.fireDate)].sort());
  });
});

describe("tap routing", () => {
  it("routes only known sources with in-app urls", () => {
    expect(isRoutableNotification({ source: "calendar", url: "/calendar?focus=x" })).toBe(true);
    expect(isRoutableNotification({ source: "credit_card_bill", url: "/credit-card-bills/b" })).toBe(true);
    expect(isRoutableNotification({ source: "calendar", url: "https://evil" })).toBe(false);
    expect(isRoutableNotification({ source: "other", url: "/x" })).toBe(false);
    expect(isRoutableNotification(undefined)).toBe(false);
  });
});
