import { describe, expect, it } from "vitest";

import type { FestivalSeva, SevaDuty } from "@/shared/types/ganesh";
import {
  addDays,
  assertCanAssignDuty,
  assertCanTransitionDuty,
  assertCanTransitionSeva,
  compareSeva,
  currentTimeInput,
  daysBetween,
  dutyCounts,
  festivalDates,
  festivalDayNumber,
  formatFestivalWindow,
  formatSevaDate,
  formatSevaTime,
  groupSevaByDay,
  isSevaOverdue,
  nextSeva,
  sevaForDate,
  sevaStatusOf,
  todaySeva,
  unstaffedSeva,
  validateSeva,
} from "./ganeshSeva";

type Row = Partial<FestivalSeva> & { id: string };

function seva(id: string, date: string, startTime: string, extra: Partial<FestivalSeva> = {}): Row {
  return { id, date, startTime, name: id, kind: "aarti", status: "scheduled", ...extra };
}

const FESTIVAL = { startDate: "2026-08-27", endDate: "2026-09-05" };

describe("seva status", () => {
  it("defaults an unknown or missing status to scheduled", () => {
    expect(sevaStatusOf(undefined)).toBe("scheduled");
    expect(sevaStatusOf({ status: "nonsense" as never })).toBe("scheduled");
    expect(sevaStatusOf({ status: "completed" })).toBe("completed");
  });

  it("treats a cancelled or voided seva as inactive everywhere", () => {
    const rows = [
      seva("a", "2026-08-28", "06:00"),
      seva("cancelled", "2026-08-28", "07:00", { status: "cancelled" }),
      seva("voided", "2026-08-28", "08:00", { voided: true }),
    ];
    expect(sevaForDate(rows, "2026-08-28").map((r) => r.id)).toEqual(["a"]);
    expect(groupSevaByDay(rows)[0].items.map((r) => r.id)).toEqual(["a"]);
  });
});

describe("isSevaOverdue", () => {
  const row = seva("aarti", "2026-08-28", "06:00");

  it("flags a scheduled seva whose start time has passed today", () => {
    expect(isSevaOverdue(row, "2026-08-28", "06:01")).toBe(true);
  });

  it("does not flag one that has not started yet", () => {
    expect(isSevaOverdue(row, "2026-08-28", "05:59")).toBe(false);
  });

  it("flags any scheduled seva left behind on an earlier day", () => {
    expect(isSevaOverdue(row, "2026-08-29", "00:00")).toBe(true);
  });

  it("never flags one that is already under way, done or cancelled", () => {
    for (const status of ["in_progress", "completed", "cancelled"] as const) {
      expect(isSevaOverdue({ ...row, status }, "2026-08-29", "23:59")).toBe(false);
    }
  });
});

describe("nextSeva", () => {
  const rows = [
    seva("morning", "2026-08-28", "06:00"),
    seva("noon", "2026-08-28", "12:30"),
    seva("evening", "2026-08-28", "19:00"),
    seva("tomorrow", "2026-08-29", "06:00"),
  ];

  it("picks today's next upcoming seva", () => {
    expect(nextSeva(rows, "2026-08-28", "09:00")?.id).toBe("noon");
  });

  it("rolls on to the next day once today is finished", () => {
    expect(nextSeva(rows, "2026-08-28", "20:00")?.id).toBe("tomorrow");
  });

  it("prefers a seva that is actually running over the clock order", () => {
    const running = rows.map((r) => (r.id === "morning" ? { ...r, status: "in_progress" as const } : r));
    expect(nextSeva(running, "2026-08-28", "19:30")?.id).toBe("morning");
  });

  it("surfaces an overdue seva rather than reporting nothing left", () => {
    const onlyOverdue = [seva("missed", "2026-08-27", "06:00")];
    expect(nextSeva(onlyOverdue, "2026-08-28", "10:00")?.id).toBe("missed");
  });

  it("returns undefined when everything is completed", () => {
    const done = rows.map((r) => ({ ...r, status: "completed" as const }));
    expect(nextSeva(done, "2026-08-28", "09:00")).toBeUndefined();
  });
});

describe("ordering and grouping", () => {
  it("orders a day chronologically regardless of input order", () => {
    const rows = [
      seva("c", "2026-08-28", "19:00"),
      seva("a", "2026-08-28", "06:00"),
      seva("b", "2026-08-28", "12:30"),
    ];
    expect(todaySeva(rows, "2026-08-28").map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("is a stable sort for two seva at the same minute", () => {
    const rows = [seva("z", "2026-08-28", "06:00"), seva("a", "2026-08-28", "06:00")];
    expect([...rows].sort(compareSeva).map((r) => r.id)).toEqual(["a", "z"]);
  });

  it("groups days in ascending order", () => {
    const rows = [
      seva("late", "2026-08-30", "06:00"),
      seva("early", "2026-08-28", "06:00"),
      seva("mid", "2026-08-29", "06:00"),
    ];
    expect(groupSevaByDay(rows).map((g) => g.date)).toEqual([
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]);
  });
});

describe("festival window", () => {
  it("counts the day of the festival inclusively", () => {
    expect(festivalDayNumber(FESTIVAL, "2026-08-27")).toEqual({ day: 1, total: 10 });
    expect(festivalDayNumber(FESTIVAL, "2026-08-30")).toEqual({ day: 4, total: 10 });
    expect(festivalDayNumber(FESTIVAL, "2026-09-05")).toEqual({ day: 10, total: 10 });
  });

  it("returns null outside the window, so the header falls back to the name", () => {
    expect(festivalDayNumber(FESTIVAL, "2026-08-26")).toBeNull();
    expect(festivalDayNumber(FESTIVAL, "2026-09-06")).toBeNull();
  });

  it("returns null when a festival has no dates", () => {
    expect(festivalDayNumber({}, "2026-08-30")).toBeNull();
    expect(festivalDayNumber(undefined, "2026-08-30")).toBeNull();
    expect(festivalDayNumber({ startDate: "2026-08-27" }, "2026-08-30")).toBeNull();
  });

  it("returns null when the dates are backwards", () => {
    expect(festivalDayNumber({ startDate: "2026-09-05", endDate: "2026-08-27" }, "2026-08-30")).toBeNull();
  });

  it("lists every date in the window for the day strip", () => {
    const dates = festivalDates(FESTIVAL);
    expect(dates).toHaveLength(10);
    expect(dates[0]).toBe("2026-08-27");
    expect(dates[9]).toBe("2026-09-05");
  });

  it("refuses an absurd window rather than building a huge array", () => {
    expect(festivalDates({ startDate: "2026-08-27", endDate: "2099-01-01" })).toEqual([]);
  });

  it("crosses a month boundary correctly", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(daysBetween("2026-08-27", "2026-09-05")).toBe(9);
  });
});

describe("dutyCounts", () => {
  const duties: Array<Partial<SevaDuty>> = [
    { status: "assigned" },
    { status: "assigned" },
    { status: "on_duty" },
    { status: "completed" },
    { status: "declined" },
  ];

  it("counts each state and excludes decliners from the committed head count", () => {
    expect(dutyCounts(duties)).toEqual({
      total: 5,
      assigned: 2,
      onDuty: 1,
      completed: 1,
      declined: 1,
      committed: 4,
    });
  });

  it("handles an empty roster", () => {
    expect(dutyCounts([])).toEqual({
      total: 0,
      assigned: 0,
      onDuty: 0,
      completed: 0,
      declined: 0,
      committed: 0,
    });
  });
});

describe("unstaffedSeva", () => {
  it("lists upcoming seva nobody is assigned to", () => {
    const rows = [
      seva("staffed", "2026-08-29", "06:00", { dutyCount: 3 }),
      seva("empty", "2026-08-29", "12:30", { dutyCount: 0 }),
      seva("also-empty", "2026-08-30", "06:00"),
      seva("past", "2026-08-27", "06:00", { dutyCount: 0 }),
      seva("done", "2026-08-29", "19:00", { dutyCount: 0, status: "completed" }),
    ];
    expect(unstaffedSeva(rows, "2026-08-28").map((r) => r.id)).toEqual(["empty", "also-empty"]);
  });
});

describe("seva transitions", () => {
  it("allows the normal run of a seva", () => {
    expect(() => assertCanTransitionSeva({ status: "scheduled" }, "in_progress")).not.toThrow();
    expect(() => assertCanTransitionSeva({ status: "in_progress" }, "completed")).not.toThrow();
  });

  it("allows marking a scheduled seva done without starting it", () => {
    expect(() => assertCanTransitionSeva({ status: "scheduled" }, "completed")).not.toThrow();
  });

  it("refuses to reopen a completed seva", () => {
    expect(() => assertCanTransitionSeva({ status: "completed" }, "in_progress")).toThrow(
      /completed seva cannot be changed/i
    );
  });

  it("refuses a no-op", () => {
    expect(() => assertCanTransitionSeva({ status: "in_progress" }, "in_progress")).toThrow(
      /already in progress/i
    );
  });

  it("refuses to start a cancelled seva, but allows restoring it", () => {
    expect(() => assertCanTransitionSeva({ status: "cancelled" }, "in_progress")).toThrow();
    expect(() => assertCanTransitionSeva({ status: "cancelled" }, "scheduled")).not.toThrow();
  });

  it("refuses anything on a removed seva", () => {
    expect(() => assertCanTransitionSeva({ status: "scheduled", voided: true }, "completed")).toThrow(
      /removed/i
    );
  });
});

describe("duty transitions", () => {
  it("allows the normal run of a duty", () => {
    expect(() => assertCanTransitionDuty({ status: "assigned" }, "on_duty")).not.toThrow();
    expect(() => assertCanTransitionDuty({ status: "on_duty" }, "completed")).not.toThrow();
  });

  it("lets a volunteer who declined be re-assigned", () => {
    expect(() => assertCanTransitionDuty({ status: "declined" }, "assigned")).not.toThrow();
  });

  it("refuses to change a finished duty", () => {
    expect(() => assertCanTransitionDuty({ status: "completed" }, "on_duty")).toThrow(
      /already finished/i
    );
  });

  it("refuses to decline someone already on duty", () => {
    expect(() => assertCanTransitionDuty({ status: "on_duty" }, "declined")).toThrow();
  });
});

describe("assertCanAssignDuty", () => {
  it("refuses to add the same volunteer twice", () => {
    expect(() => assertCanAssignDuty([{ userId: "u1" }], "u1")).toThrow(/already on this seva/i);
  });

  it("allows a different volunteer", () => {
    expect(() => assertCanAssignDuty([{ userId: "u1" }], "u2")).not.toThrow();
  });

  it("requires a volunteer to be chosen", () => {
    expect(() => assertCanAssignDuty([], "  ")).toThrow(/choose a volunteer/i);
  });
});

describe("validateSeva", () => {
  const base = { name: "Morning Aarti", kind: "aarti" as const, date: "2026-08-28", startTime: "06:00" };

  it("accepts a well-formed seva", () => {
    expect(validateSeva(base)).toEqual({ ok: true });
    expect(validateSeva({ ...base, endTime: "07:00" })).toEqual({ ok: true });
  });

  it("requires a name", () => {
    expect(validateSeva({ ...base, name: "   " })).toMatchObject({ ok: false });
  });

  it("rejects a malformed date or time", () => {
    expect(validateSeva({ ...base, date: "28-08-2026" })).toMatchObject({ ok: false });
    expect(validateSeva({ ...base, startTime: "6:00" })).toMatchObject({ ok: false });
    expect(validateSeva({ ...base, startTime: "25:00" })).toMatchObject({ ok: false });
    expect(validateSeva({ ...base, startTime: "06:60" })).toMatchObject({ ok: false });
  });

  it("rejects an end time at or before the start", () => {
    expect(validateSeva({ ...base, endTime: "06:00" })).toMatchObject({ ok: false });
    expect(validateSeva({ ...base, endTime: "05:00" })).toMatchObject({ ok: false });
  });
});

describe("formatting", () => {
  it("formats a 24-hour time as a 12-hour clock", () => {
    expect(formatSevaTime("06:00")).toBe("6:00 AM");
    expect(formatSevaTime("12:30")).toBe("12:30 PM");
    expect(formatSevaTime("00:15")).toBe("12:15 AM");
    expect(formatSevaTime("19:05")).toBe("7:05 PM");
  });

  it("returns empty for a malformed or missing time rather than NaN", () => {
    expect(formatSevaTime(undefined)).toBe("");
    expect(formatSevaTime("6:00")).toBe("");
    expect(formatSevaTime("nonsense")).toBe("");
  });

  it("formats a date without drifting a day across timezones", () => {
    // Sliced, never parsed into a local Date — see the note in ganeshSeva.ts.
    expect(formatSevaDate("2026-08-28")).toBe("28 Aug");
    expect(formatSevaDate("2026-09-05")).toBe("5 Sep");
    expect(formatSevaDate("2026-01-01")).toBe("1 Jan");
  });

  it("adds the correct weekday", () => {
    expect(formatSevaDate("2026-08-27", true)).toBe("Thu 27 Aug");
    expect(formatSevaDate("2026-08-30", true)).toBe("Sun 30 Aug");
  });

  it("collapses the month when a festival stays inside one", () => {
    expect(formatFestivalWindow({ startDate: "2026-08-27", endDate: "2026-08-30" })).toBe(
      "27 – 30 Aug"
    );
  });

  it("keeps both months when the festival crosses one", () => {
    expect(formatFestivalWindow(FESTIVAL)).toBe("27 Aug – 5 Sep");
  });

  it("degrades gracefully with one date or none", () => {
    expect(formatFestivalWindow({ startDate: "2026-08-27" })).toBe("27 Aug");
    expect(formatFestivalWindow({ startDate: "2026-08-27", endDate: "2026-08-27" })).toBe("27 Aug");
    expect(formatFestivalWindow({})).toBe("");
    expect(formatFestivalWindow(undefined)).toBe("");
  });
});

describe("currentTimeInput", () => {
  it("zero-pads to HH:mm so it compares lexically against startTime", () => {
    expect(currentTimeInput(new Date(2026, 7, 28, 6, 5))).toBe("06:05");
    expect(currentTimeInput(new Date(2026, 7, 28, 19, 30))).toBe("19:30");
  });
});
