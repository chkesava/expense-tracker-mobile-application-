import { describe, expect, it } from "vitest";

import {
  formatDayHeading,
  formatDisplayDate,
  formatMonthLabel,
} from "@/shared/utils/dateDisplay";
import {
  daysBetweenDateKeys,
  endOfWeekDateKey,
  orderedWeekdays,
  startOfWeekDateKey,
} from "@/shared/utils/dates";

describe("formatDisplayDate", () => {
  it("renders each supported dateFormat option", () => {
    expect(formatDisplayDate("2026-08-22", "YYYY-MM-DD")).toBe("2026-08-22");
    expect(formatDisplayDate("2026-08-22", "DD/MM/YYYY")).toBe("22/08/2026");
    expect(formatDisplayDate("2026-08-22", "MM/DD/YYYY")).toBe("08/22/2026");
    expect(formatDisplayDate("2026-08-22", "DD MMM YYYY")).toBe("22 Aug 2026");
  });

  it("zero-pads single-digit days and months", () => {
    expect(formatDisplayDate("2026-01-05", "DD/MM/YYYY")).toBe("05/01/2026");
    expect(formatDisplayDate("2026-01-05", "DD MMM YYYY")).toBe("05 Jan 2026");
  });

  it("returns the input unchanged when it is not a real date", () => {
    expect(formatDisplayDate("not-a-date", "DD/MM/YYYY")).toBe("not-a-date");
  });

  it("defaults to ISO when no format is given", () => {
    expect(formatDisplayDate("2026-08-22")).toBe("2026-08-22");
  });
});

describe("formatDayHeading", () => {
  it("keeps the year under ISO but drops it for the others", () => {
    // 2026-08-22 is a Saturday.
    expect(formatDayHeading("2026-08-22", "YYYY-MM-DD")).toBe("Sat 2026-08-22");
    expect(formatDayHeading("2026-08-22", "DD/MM/YYYY")).toBe("Sat 22/08");
    expect(formatDayHeading("2026-08-22", "MM/DD/YYYY")).toBe("Sat 08/22");
    expect(formatDayHeading("2026-08-22", "DD MMM YYYY")).toBe("Sat, 22 Aug");
  });

  it("follows the preference's day/month order", () => {
    const dayFirst = formatDayHeading("2026-03-04", "DD/MM/YYYY");
    const monthFirst = formatDayHeading("2026-03-04", "MM/DD/YYYY");
    expect(dayFirst).toBe("Wed 04/03");
    expect(monthFirst).toBe("Wed 03/04");
    expect(dayFirst).not.toBe(monthFirst);
  });
});

describe("formatMonthLabel", () => {
  it("stays numeric under ISO and uses names otherwise", () => {
    expect(formatMonthLabel("2026-08", "YYYY-MM-DD")).toBe("2026-08");
    expect(formatMonthLabel("2026-08", "DD/MM/YYYY")).toBe("Aug 2026");
    expect(formatMonthLabel("2026-08", "DD MMM YYYY")).toBe("Aug 2026");
  });

  it("supports long month names for screen titles", () => {
    expect(formatMonthLabel("2026-08", "DD/MM/YYYY", { long: true })).toBe(
      "August 2026"
    );
  });

  it("returns the key unchanged when the month is out of range", () => {
    expect(formatMonthLabel("2026-13", "DD/MM/YYYY")).toBe("2026-13");
    expect(formatMonthLabel("garbage", "DD/MM/YYYY")).toBe("garbage");
  });
});

describe("week boundaries", () => {
  it("resolves the start of week for both first-day preferences", () => {
    // 2026-08-22 is a Saturday.
    expect(startOfWeekDateKey("2026-08-22", "monday")).toBe("2026-08-17");
    expect(startOfWeekDateKey("2026-08-22", "sunday")).toBe("2026-08-16");
  });

  it("treats the first day itself as the start of its own week", () => {
    // 2026-08-17 is a Monday, 2026-08-16 a Sunday.
    expect(startOfWeekDateKey("2026-08-17", "monday")).toBe("2026-08-17");
    expect(startOfWeekDateKey("2026-08-16", "sunday")).toBe("2026-08-16");
  });

  it("puts Sunday at the end of a Monday-first week", () => {
    expect(startOfWeekDateKey("2026-08-23", "monday")).toBe("2026-08-17");
    expect(endOfWeekDateKey("2026-08-17", "monday")).toBe("2026-08-23");
  });

  it("crosses month and year boundaries", () => {
    // 2026-01-01 is a Thursday.
    expect(startOfWeekDateKey("2026-01-01", "monday")).toBe("2025-12-29");
    expect(startOfWeekDateKey("2026-01-01", "sunday")).toBe("2025-12-28");
  });

  it("counts whole days between keys", () => {
    expect(daysBetweenDateKeys("2026-08-17", "2026-08-22")).toBe(5);
    expect(daysBetweenDateKeys("2026-08-22", "2026-08-17")).toBe(-5);
    expect(daysBetweenDateKeys("2026-08-22", "2026-08-22")).toBe(0);
  });

  it("rotates weekday labels to the chosen first day", () => {
    expect(orderedWeekdays("monday").map((d) => d.label)).toEqual([
      "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
    ]);
    expect(orderedWeekdays("sunday").map((d) => d.label)).toEqual([
      "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
    ]);
  });

  it("keeps each label paired with its own getDay() index", () => {
    const monday = orderedWeekdays("monday");
    expect(monday[0]).toEqual({ index: 1, label: "Mon" });
    expect(monday[6]).toEqual({ index: 0, label: "Sun" });
  });
});
