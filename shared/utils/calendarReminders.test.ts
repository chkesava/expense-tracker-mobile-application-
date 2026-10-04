import { describe, expect, it } from "vitest";

import type { CalendarReminder } from "../types/calendarReminder";
import { queryCalendar } from "./calendarQuery";
import { reminderDoc, reminderEvents, toggleReminderCompletion, validateReminderDraft, type ReminderDraft } from "./calendarReminders";
import type { CalendarContext } from "./calendarSources";

const draft = (over: Partial<ReminderDraft> = {}): ReminderDraft => ({
  title: "Renew car insurance",
  startDate: "2026-10-20",
  category: "insurance",
  recurrence: "none",
  remindDaysBefore: 1,
  ...over,
});
const reminder = (over: Partial<CalendarReminder> = {}): CalendarReminder => ({
  id: "r1",
  ...draft(),
  completedDates: [],
  createdAtMs: 1,
  updatedAtMs: 1,
  ...over,
});
const ctx = (from = "2026-10-01", to = "2026-12-31", today = "2026-10-15"): CalendarContext => ({ range: { from, to }, today, currency: "INR" });

describe("validation", () => {
  it("accepts a good draft and explains every problem", () => {
    expect(validateReminderDraft(draft())).toEqual([]);
    expect(
      validateReminderDraft(
        draft({ title: " ", startDate: "2026-13-01", time: "25:00", estimatedAmount: -1, recurrence: "every_n_days", intervalDays: 0, note: "x".repeat(501) })
      )
    ).toHaveLength(6);
    expect(validateReminderDraft(draft({ recurrence: "monthly", untilDate: "2026-09-01" }))).toEqual(["The end date must be on or after the start date."]);
  });
});

describe("occurrences", () => {
  it("keeps a one-time reminder on its date, overdue once past", () => {
    expect(reminderEvents([reminder()], ctx())).toEqual([
      expect.objectContaining({ id: "reminder:r1:2026-10-20", source: "reminder", direction: "neutral", state: "scheduled", amount: null }),
    ]);
    expect(reminderEvents([reminder({ startDate: "2026-10-02" })], ctx())[0]).toMatchObject({ date: "2026-10-02", state: "overdue" });
  });

  it("repeats monthly, yearly and every N days, clamped to short months and stopping at the end date", () => {
    const monthly = reminderEvents([reminder({ startDate: "2026-10-31", recurrence: "monthly", untilDate: "2026-12-31" })], ctx());
    expect(monthly.map((e) => e.date)).toEqual(["2026-10-31", "2026-11-30", "2026-12-31"]);
    const yearly = reminderEvents([reminder({ startDate: "2028-02-29", recurrence: "yearly" })], ctx("2028-01-01", "2030-12-31", "2028-01-01"));
    expect(yearly.map((e) => e.date)).toEqual(["2028-02-29", "2029-02-28", "2030-02-28"]);
    const every = reminderEvents([reminder({ startDate: "2026-10-01", recurrence: "every_n_days", intervalDays: 10, untilDate: "2026-10-25" })], ctx());
    expect(every.map((e) => e.date)).toEqual(["2026-10-01", "2026-10-11", "2026-10-21"]);
  });

  it("never creates duplicate instances and never starts before the start date", () => {
    const events = reminderEvents([reminder({ startDate: "2026-11-15", recurrence: "monthly" })], ctx());
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    expect(events[0].date).toBe("2026-11-15");
  });

  it("marks completed occurrences done and keeps them in history", () => {
    const events = reminderEvents([reminder({ startDate: "2026-10-01", recurrence: "monthly", completedDates: ["2026-10-01"] })], ctx());
    expect(events.map((e) => e.state)).toEqual(["completed", "scheduled", "scheduled"]);
  });

  it("shows an estimated amount but stays neutral, so it never counts as money", () => {
    expect(reminderEvents([reminder({ estimatedAmount: 12000.456 })], ctx())[0]).toMatchObject({ amount: 12000.46, direction: "neutral" });
  });

  it("appears in calendar queries like any other source", () => {
    const empty = { bills: [], cardNames: new Map(), subscriptions: [], borrowings: [], receivables: [], incomes: [], goals: [], investments: [], sipPlans: [], epfContributions: [], epfEmployerNames: new Map() };
    const r = queryCalendar({ range: { from: "2026-10-01", to: "2026-10-31" }, today: "2026-10-15", currency: "INR", data: { ...empty, reminders: [reminder()] } });
    expect(r.events.map((e) => e.source)).toEqual(["reminder"]);
  });
});

describe("completion", () => {
  it("toggles idempotently", () => {
    expect(toggleReminderCompletion(["2026-10-01"], "2026-10-01", true)).toEqual(["2026-10-01"]);
    expect(toggleReminderCompletion(["2026-10-01"], "2026-11-01", true)).toEqual(["2026-10-01", "2026-11-01"]);
    expect(toggleReminderCompletion(["2026-10-01"], "2026-10-01", false)).toEqual([]);
  });
});

describe("document", () => {
  it("omits empty optional fields and never writes undefined", () => {
    const d = reminderDoc(draft({ title: "  Pay rent ", note: "  ", recurrence: "none", untilDate: "2027-01-01" }), { completedDates: [], createdAtMs: 5 }, 9);
    expect(d).toEqual({ title: "Pay rent", startDate: "2026-10-20", category: "insurance", recurrence: "none", remindDaysBefore: 1, completedDates: [], createdAtMs: 5, updatedAtMs: 9 });
    expect(Object.values(d)).not.toContain(undefined);
    const full = reminderDoc(draft({ time: "09:30", estimatedAmount: 500, recurrence: "every_n_days", intervalDays: 30, untilDate: "2027-01-01", note: "policy 42" }), { completedDates: ["x"], createdAtMs: 5 }, 9);
    expect(Object.keys(full).sort()).toEqual(
      ["category", "completedDates", "createdAtMs", "estimatedAmount", "intervalDays", "note", "recurrence", "remindDaysBefore", "startDate", "time", "title", "untilDate", "updatedAtMs"].sort()
    );
  });
});
