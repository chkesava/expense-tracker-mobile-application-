import { describe, expect, it } from "vitest";

import {
  DAY_PERIODS,
  dayPeriodAt,
  dayPeriodForHour,
  greetingFor,
  msUntilNextPeriod,
} from "./dayPeriod";

const at = (h: number, m = 0) => new Date(2026, 9, 21, h, m, 0, 0);

describe("dayPeriodForHour", () => {
  it.each([
    [0, "night"],
    [4, "night"],
    [5, "morning"],
    [11, "morning"],
    [12, "afternoon"],
    [16, "afternoon"],
    [17, "evening"],
    [20, "evening"],
    [21, "night"],
    [23, "night"],
  ] as const)("hour %i is %s", (hour, period) => {
    expect(dayPeriodForHour(hour)).toBe(period);
  });

  it("uses the minute-level boundaries the ticket specifies", () => {
    expect(dayPeriodAt(at(4, 59))).toBe("night");
    expect(dayPeriodAt(at(11, 59))).toBe("morning");
    expect(dayPeriodAt(at(16, 59))).toBe("afternoon");
    expect(dayPeriodAt(at(20, 59))).toBe("evening");
  });
});

describe("greetingFor", () => {
  it("has a greeting for every period", () => {
    for (const { period } of DAY_PERIODS) {
      expect(greetingFor(period)).toMatch(/^Good /);
    }
    expect(greetingFor("night")).toBe("Good night");
  });
});

describe("msUntilNextPeriod", () => {
  const MIN = 60_000;

  it("counts to the next boundary within the day", () => {
    expect(msUntilNextPeriod(at(16, 30))).toBe(30 * MIN);
    expect(msUntilNextPeriod(at(5, 0))).toBe(7 * 60 * MIN);
  });

  it("wraps across midnight to the morning boundary", () => {
    expect(msUntilNextPeriod(at(23, 0))).toBe(6 * 60 * MIN);
    expect(msUntilNextPeriod(at(21, 0))).toBe(8 * 60 * MIN);
  });

  it("is never zero, even exactly on a boundary", () => {
    expect(msUntilNextPeriod(at(12, 0))).toBe(5 * 60 * MIN);
  });
});
