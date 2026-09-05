import { describe, expect, it } from "vitest";

import {
  isWithinRange,
  resolveReportRange,
  toDateKey,
  validateRange,
  type ReportRange,
} from "@/shared/utils/ganeshReportRange";

/**
 * Report date ranges (GS-079).
 *
 * The ledger stores dates as `yyyy-mm-dd` chosen by a person on a calendar, so
 * every comparison here is on strings and stays in local time. Going through
 * UTC would move a collection recorded late in the evening into the previous
 * day for anyone east of Greenwich — which, for an Indian Pandal, is everyone.
 */

// A Saturday, deliberately: it catches a week that starts on the wrong day.
const SATURDAY = new Date(2026, 8, 5, 21, 30);

function range(preset: Parameters<typeof resolveReportRange>[0]["preset"], extra = {}) {
  return resolveReportRange({ preset, today: SATURDAY, ...extra });
}

describe("presets", () => {
  it("resolves today from local time, not UTC", () => {
    // 21:30 IST on the 5th is already the 6th in UTC. Reporting "today" as the
    // 6th would move the evening's collections into tomorrow.
    expect(range("today")).toMatchObject({ start: "2026-09-05", end: "2026-09-05" });
  });

  it("resolves yesterday", () => {
    expect(range("yesterday")).toMatchObject({ start: "2026-09-04", end: "2026-09-04" });
  });

  it("starts the week on Monday", () => {
    // A collection drive runs across a weekend; a Sunday-start week would cut
    // Saturday and Sunday into different reports.
    expect(range("this_week")).toMatchObject({ start: "2026-08-31", end: "2026-09-05" });
  });

  it("keeps Sunday in the week that just ended", () => {
    const sunday = resolveReportRange({ preset: "this_week", today: new Date(2026, 8, 6) });
    expect(sunday.start).toBe("2026-08-31");
  });

  it("resolves this month from the first", () => {
    expect(range("this_month")).toMatchObject({ start: "2026-09-01", end: "2026-09-05" });
  });

  it("uses a festival's own dates", () => {
    const result = range("current_festival", {
      currentFestival: { name: "Ganesh Utsav", startDate: "2026-09-01", endDate: "2026-09-11" },
    });
    expect(result).toMatchObject({ start: "2026-09-01", end: "2026-09-11" });
    expect(result.label).toContain("Ganesh Utsav");
  });

  it("leaves a dateless festival unbounded rather than empty", () => {
    // An empty range would report zero for a festival that has money in it.
    const result = range("current_festival", { currentFestival: { name: "Ganesh Utsav" } });
    expect(result.start).toBeNull();
    expect(result.end).toBeNull();
  });

  it("says so when there is no previous festival", () => {
    expect(range("previous_festival").label).toContain("none found");
  });

  it("carries a custom range and labels it", () => {
    const result = range("custom", { customStart: "2026-09-01", customEnd: "2026-09-03" });
    expect(result.label).toBe("2026-09-01 to 2026-09-03");
  });

  it("labels a half-open custom range honestly", () => {
    expect(range("custom", { customStart: "2026-09-01" }).label).toBe("From 2026-09-01");
    expect(range("custom", { customEnd: "2026-09-03" }).label).toBe("Up to 2026-09-03");
    expect(range("custom").label).toBe("All dates");
  });
});

describe("membership is inclusive on both ends", () => {
  const bounded: ReportRange = {
    preset: "custom",
    start: "2026-09-02",
    end: "2026-09-04",
    label: "test",
  };

  it("includes both boundary days", () => {
    // An exclusive end silently drops the last day of a festival, which is the
    // biggest collection day there is.
    expect(isWithinRange("2026-09-02", bounded)).toBe(true);
    expect(isWithinRange("2026-09-04", bounded)).toBe(true);
  });

  it("excludes days outside", () => {
    expect(isWithinRange("2026-09-01", bounded)).toBe(false);
    expect(isWithinRange("2026-09-05", bounded)).toBe(false);
  });

  it("keeps everything when the range is unbounded", () => {
    const all: ReportRange = { preset: "custom", start: null, end: null, label: "all" };
    expect(isWithinRange("1999-01-01", all)).toBe(true);
    expect(isWithinRange(undefined, all)).toBe(true);
  });

  it("excludes a dateless row from a bounded range", () => {
    // Including it would put an undated row in every range at once.
    expect(isWithinRange(undefined, bounded)).toBe(false);
  });
});

describe("validation", () => {
  it("refuses a backwards custom range", () => {
    const result = validateRange({
      preset: "custom",
      start: "2026-09-10",
      end: "2026-09-01",
      label: "x",
    });
    expect(result.ok).toBe(false);
  });

  it("accepts the presets without argument", () => {
    expect(validateRange(range("this_week")).ok).toBe(true);
  });
});

describe("toDateKey", () => {
  it("pads month and day", () => {
    expect(toDateKey(new Date(2026, 0, 3))).toBe("2026-01-03");
  });
});
