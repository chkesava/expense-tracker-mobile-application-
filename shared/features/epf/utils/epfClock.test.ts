import { describe, expect, it } from "vitest";

import {
  EPF_TIMEZONE,
  epfCurrentMonth,
  epfTodayKey,
} from "@/shared/features/epf/utils/epfClock";

describe("epfClock", () => {
  it("uses EPF's statutory timezone, not UTC and not the device", () => {
    expect(EPF_TIMEZONE).toBe("Asia/Kolkata");
  });

  it("reports the IST month when UTC is still in the previous one", () => {
    // 01 Oct 2026, 02:00 IST === 30 Sep 2026, 20:30 UTC.
    // This is the exact disagreement KAN-72 exists to remove.
    const instant = new Date("2026-09-30T20:30:00Z");

    expect(epfTodayKey(instant)).toBe("2026-10-01");
    expect(epfCurrentMonth(instant)).toBe("2026-10");

    // What the old UTC-based cron would have said:
    expect(instant.toISOString().slice(0, 7)).toBe("2026-09");
  });

  it("reports the IST day when UTC is still on the previous one", () => {
    // 23:00 UTC is 04:30 IST the next morning.
    const instant = new Date("2026-08-14T23:00:00Z");
    expect(epfTodayKey(instant)).toBe("2026-08-15");
  });

  it("agrees with UTC during the working day, when the cron actually runs", () => {
    // The schedule fires at 05:30 UTC = 11:00 IST, where both read the same.
    const instant = new Date("2026-10-03T05:30:00Z");
    expect(epfTodayKey(instant)).toBe("2026-10-03");
    expect(epfCurrentMonth(instant)).toBe("2026-10");
  });

  it("rolls the year over correctly", () => {
    // 31 Dec 2026 20:00 UTC === 01 Jan 2027 01:30 IST.
    const instant = new Date("2026-12-31T20:00:00Z");
    expect(epfTodayKey(instant)).toBe("2027-01-01");
    expect(epfCurrentMonth(instant)).toBe("2027-01");
  });

  it("handles the financial-year boundary in IST", () => {
    // 31 Mar 2027 19:00 UTC === 01 Apr 2027 00:30 IST — a new financial year.
    const instant = new Date("2027-03-31T19:00:00Z");
    expect(epfCurrentMonth(instant)).toBe("2027-04");
  });

  it("always produces a well-formed key", () => {
    expect(epfTodayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(epfCurrentMonth()).toMatch(/^\d{4}-\d{2}$/);
  });

  it("derives the month as a prefix of the day, so they can never disagree", () => {
    const instant = new Date("2026-09-30T20:30:00Z");
    expect(epfTodayKey(instant).startsWith(epfCurrentMonth(instant))).toBe(true);
  });
});
