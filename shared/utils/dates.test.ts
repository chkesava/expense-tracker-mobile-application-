import { afterEach, describe, expect, it, vi } from "vitest";
import {
  billDateForMonth,
  clampBillDay,
  currentMonthKey,
  daysInMonth,
  formatDateKey,
  isValidDateKey,
  isValidMonthKey,
  monthFromDateKey,
  parseLocalDate,
  toLocalDateKey,
  todayDateKey,
} from "./dates";

describe("dates", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("parseLocalDate / toLocalDateKey", () => {
    it("parses YYYY-MM-DD as local midnight (not UTC)", () => {
      const d = parseLocalDate("2026-08-11");
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(7);
      expect(d.getDate()).toBe(11);
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
    });

    it("round-trips local calendar keys", () => {
      expect(toLocalDateKey(parseLocalDate("2026-02-28"))).toBe("2026-02-28");
      expect(toLocalDateKey(parseLocalDate("2024-02-29"))).toBe("2024-02-29");
    });
  });

  describe("formatDateKey / todayDateKey / currentMonthKey", () => {
    it("formats a fixed Instant in Asia/Kolkata as local calendar day", () => {
      // 2026-08-10 22:30 UTC → 2026-08-11 04:00 IST
      const instant = new Date("2026-08-10T22:30:00.000Z");
      expect(formatDateKey(instant, "Asia/Kolkata")).toBe("2026-08-11");
      expect(formatDateKey(instant, "UTC")).toBe("2026-08-10");
    });

    it("uses frozen local clock for todayDateKey / currentMonthKey without explicit tz", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 11, 15, 30, 0));
      expect(todayDateKey()).toBe(toLocalDateKey(new Date()));
      expect(currentMonthKey()).toBe("2026-08");
    });
  });

  describe("monthFromDateKey", () => {
    it("derives YYYY-MM from a date key", () => {
      expect(monthFromDateKey("2026-08-11")).toBe("2026-08");
    });
  });

  describe("isValidDateKey / isValidMonthKey", () => {
    it("accepts real calendar dates and rejects impossible days", () => {
      expect(isValidDateKey("2026-08-11")).toBe(true);
      expect(isValidDateKey("2024-02-29")).toBe(true);
      expect(isValidDateKey("2026-02-29")).toBe(false);
      expect(isValidDateKey("2026-13-01")).toBe(false);
      expect(isValidDateKey("26-08-11")).toBe(false);
      expect(isValidDateKey("")).toBe(false);
    });

    it("accepts YYYY-MM shape for month keys (format-only check)", () => {
      expect(isValidMonthKey("2026-08")).toBe(true);
      expect(isValidMonthKey("2026-8")).toBe(false);
      expect(isValidMonthKey("202608")).toBe(false);
      // Documented: does not validate month range 01–12
      expect(isValidMonthKey("2026-13")).toBe(true);
    });
  });

  describe("daysInMonth / clampBillDay / billDateForMonth", () => {
    it("returns correct month lengths including leap February", () => {
      expect(daysInMonth(2026, 0)).toBe(31);
      expect(daysInMonth(2026, 1)).toBe(28);
      expect(daysInMonth(2024, 1)).toBe(29);
      expect(daysInMonth(2026, 3)).toBe(30);
    });

    it("clamps bill day into the month and never below 1", () => {
      expect(clampBillDay(2026, 1, 31)).toBe(28);
      expect(clampBillDay(2024, 1, 31)).toBe(29);
      expect(clampBillDay(2026, 0, 0)).toBe(1);
      expect(clampBillDay(2026, 0, -5)).toBe(1);
      expect(clampBillDay(2026, 0, 15)).toBe(15);
    });

    it("builds local midnight bill dates with clamped day", () => {
      const feb = billDateForMonth(2026, 1, 31);
      expect(toLocalDateKey(feb)).toBe("2026-02-28");
      expect(feb.getHours()).toBe(0);

      const jan = billDateForMonth(2026, 0, 15);
      expect(toLocalDateKey(jan)).toBe("2026-01-15");
    });

    it("rolls monthIndex overflow via Date (Dec + 1 → next Jan)", () => {
      const next = billDateForMonth(2026, 12, 1);
      expect(toLocalDateKey(next)).toBe("2027-01-01");
    });
  });
});
