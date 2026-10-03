import { describe, expect, it } from "vitest";

import { CALENDAR_SOURCES, CALENDAR_STATES, type CalendarEvent } from "../types/calendar";
import { calendarEventActions, calendarStateExplanation } from "./calendarActions";

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: "x",
  source: "card_bill",
  refId: "b1",
  date: "2026-10-18",
  title: "Bill",
  amount: 100,
  currency: "INR",
  direction: "out",
  state: "scheduled",
  priority: 1,
  actionable: true,
  href: "/credit-card-bills/b1",
  ...over,
});

describe("calendar event actions", () => {
  it("routes every non-reminder source to its own feature", () => {
    for (const source of CALENDAR_SOURCES.filter((s) => s !== "reminder")) {
      const actions = calendarEventActions(ev({ source, href: `/somewhere/${source}` }));
      expect(actions, source).toHaveLength(1);
      expect(actions[0]).toMatchObject({ primary: true, href: `/somewhere/${source}` });
    }
  });

  it("offers the pay or record path only while open", () => {
    expect(calendarEventActions(ev({}))[0].label).toBe("View and pay bill");
    expect(calendarEventActions(ev({ state: "completed" }))[0].label).toBe("View bill");
    expect(calendarEventActions(ev({ source: "borrowing", state: "overdue" }))[0].label).toBe("View loan and record repayment");
  });

  it("shows nothing for cancelled or missing records", () => {
    expect(calendarEventActions(ev({ state: "cancelled" }))).toEqual([]);
    expect(calendarEventActions(null)).toEqual([]);
  });

  it("explains every state", () => {
    for (const state of CALENDAR_STATES) expect(calendarStateExplanation(ev({ state })).length).toBeGreaterThan(10);
  });
});
