import { describe, expect, it } from "vitest";

import { canShiftMonth, initialPickerMonth, isDateAllowed, isMonthAllowed, pickerMonthGrid, yearsInRange } from "./datePicker";

const today = "2026-10-18";

describe("pickerMonthGrid", () => {
  it("covers whole weeks starting on Monday", () => {
    const { weekdays, weeks } = pickerMonthGrid("2026-10", "monday", { today });
    expect(weekdays[0]).toBe("Mon");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    // 1 Oct 2026 is a Thursday, so the grid starts on Mon 28 Sep.
    expect(weeks[0][0]).toMatchObject({ date: "2026-09-28", inMonth: false });
    expect(weeks[0][3]).toMatchObject({ date: "2026-10-01", day: 1, inMonth: true });
    expect(weeks.at(-1)!.at(-1)!.date).toBe("2026-11-01");
  });

  it("starts on Sunday when asked", () => {
    const { weekdays, weeks } = pickerMonthGrid("2026-10", "sunday", { today });
    expect(weekdays[0]).toBe("Sun");
    expect(weeks[0][0].date).toBe("2026-09-27");
  });

  it("handles a leap February and a six-week month", () => {
    const feb = pickerMonthGrid("2028-02", "monday", { today });
    expect(feb.weeks.flat().filter((c) => c.inMonth)).toHaveLength(29);
    // August 2026 starts on a Saturday and has 31 days: six Monday-first weeks.
    expect(pickerMonthGrid("2026-08", "monday", { today }).weeks).toHaveLength(6);
  });

  it("marks today, the selection and days outside the limits", () => {
    const cells = pickerMonthGrid("2026-10", "monday", { today, selected: "2026-10-05", min: "2026-10-03", max: today }).weeks.flat();
    const byDate = new Map(cells.map((c) => [c.date, c]));
    expect(byDate.get(today)).toMatchObject({ isToday: true, disabled: false });
    expect(byDate.get(today)!.accessibilityLabel).toBe("Sunday, 18 October 2026, today");
    expect(byDate.get("2026-10-05")).toMatchObject({ isSelected: true });
    expect(byDate.get("2026-10-05")!.accessibilityLabel).toContain("selected");
    expect(byDate.get("2026-10-02")).toMatchObject({ disabled: true });
    expect(byDate.get("2026-10-02")!.accessibilityLabel).toContain("unavailable");
    expect(byDate.get("2026-10-19")).toMatchObject({ disabled: true });
    expect(byDate.get("2026-10-03")).toMatchObject({ disabled: false });
  });
});

describe("limits", () => {
  it("treats empty or partial limits as no limit", () => {
    expect(isDateAllowed("1999-01-01", { min: "", max: "2026-1" })).toBe(true);
    expect(isDateAllowed("2026-10-18", { min: "2026-10-18", max: "2026-10-18" })).toBe(true);
    expect(isDateAllowed("2026-10-17", { min: "2026-10-18" })).toBe(false);
  });

  it("knows which months still have an allowed day", () => {
    expect(isMonthAllowed("2026-09", { min: "2026-09-30" })).toBe(true);
    expect(isMonthAllowed("2026-08", { min: "2026-09-30" })).toBe(false);
    expect(isMonthAllowed("2026-11", { max: today })).toBe(false);
  });
});

describe("initialPickerMonth", () => {
  it("opens on the value's month, else today's", () => {
    expect(initialPickerMonth("2024-02-29", today)).toBe("2024-02");
    expect(initialPickerMonth("", today)).toBe("2026-10");
    expect(initialPickerMonth("2026-13-01", today)).toBe("2026-10");
  });

  it("clamps into the limits", () => {
    expect(initialPickerMonth("", today, { max: "2025-06-30" })).toBe("2025-06");
    expect(initialPickerMonth("2020-01-01", today, { min: "2026-01-15" })).toBe("2026-01");
  });
});

describe("canShiftMonth", () => {
  it("stops at the months holding the limits", () => {
    expect(canShiftMonth("2026-10", 1, { max: today })).toBe(false);
    expect(canShiftMonth("2026-10", -1, { max: today })).toBe(true);
    expect(canShiftMonth("2026-01", -1, { min: "2026-01-15" })).toBe(false);
    expect(canShiftMonth("2026-12", 1)).toBe(true);
  });
});

describe("yearsInRange", () => {
  it("defaults to 50 years either side of today", () => {
    const years = yearsInRange(today);
    expect(years[0]).toBe(1976);
    expect(years.at(-1)).toBe(2076);
  });

  it("narrows to the limits", () => {
    expect(yearsInRange(today, { min: "2024-05-01", max: today })).toEqual([2024, 2025, 2026]);
  });
});
