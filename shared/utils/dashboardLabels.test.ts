import { describe, expect, it } from "vitest";

import { dashboardMonthLabel, shortRowDate } from "./dashboardLabels";

describe("dashboardMonthLabel (SPENDLY-572)", () => {
  it("reads This month for the current month, month name otherwise", () => {
    expect(dashboardMonthLabel("2026-10", "2026-10")).toBe("This month");
    expect(dashboardMonthLabel("2026-09", "2026-10")).toBe("Sep 2026");
    expect(dashboardMonthLabel("2025-12", "2026-10")).toBe("Dec 2025");
    expect(dashboardMonthLabel("bad", "2026-10")).toBe("bad");
  });
});

describe("shortRowDate (SPENDLY-572)", () => {
  const today = "2026-10-22";
  it("is relative near today and short otherwise", () => {
    expect(shortRowDate("2026-10-22", today)).toBe("Today");
    expect(shortRowDate("2026-10-21", today)).toBe("Yesterday");
    expect(shortRowDate("2026-10-16", today)).toBe("16 Oct");
    expect(shortRowDate("2025-12-31", today)).toBe("31 Dec 2025");
    expect(shortRowDate("2026-11-01", "2026-11-02")).toBe("Yesterday");
    expect(shortRowDate("", today)).toBe("");
  });
});
