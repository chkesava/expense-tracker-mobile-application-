import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBillingCycleDates,
  getClosedBillingCycle,
  getDaysUntilReset,
  getOpenBillingCycle,
  isDateKeyInInclusiveRange,
} from "./billingCycle";
import { toLocalDateKey } from "./dates";

describe("billingCycle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getBillingCycleDates", () => {
    it("uses previous month cycle when today is before the bill day", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0)); // 10 Aug 2026

      const { previousBillDate, nextBillDate } = getBillingCycleDates(15);

      expect(toLocalDateKey(previousBillDate)).toBe("2026-07-15");
      expect(toLocalDateKey(nextBillDate)).toBe("2026-08-15");
    });

    it("opens a new cycle on the bill day itself (inclusive start)", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 15, 0, 0, 0)); // bill day

      const { previousBillDate, nextBillDate } = getBillingCycleDates(15);

      expect(toLocalDateKey(previousBillDate)).toBe("2026-08-15");
      expect(toLocalDateKey(nextBillDate)).toBe("2026-09-15");
    });

    it("keeps the current-month start after the bill day", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 20, 18, 0, 0));

      const { previousBillDate, nextBillDate } = getBillingCycleDates(15);

      expect(toLocalDateKey(previousBillDate)).toBe("2026-08-15");
      expect(toLocalDateKey(nextBillDate)).toBe("2026-09-15");
    });

    it("clamps bill day 31 across February and year boundaries", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 2, 5, 12, 0, 0)); // 5 Mar 2026, before day 31

      const { previousBillDate, nextBillDate } = getBillingCycleDates(31);

      expect(toLocalDateKey(previousBillDate)).toBe("2026-02-28");
      expect(toLocalDateKey(nextBillDate)).toBe("2026-03-31");
    });

    it("closes a 31st card on the last calendar day of each month", () => {
      const jan = getClosedBillingCycle(31, new Date(2026, 0, 31));
      expect(toLocalDateKey(jan.cycleStart)).toBe("2026-01-01");
      expect(toLocalDateKey(jan.cycleEnd)).toBe("2026-01-31");

      const feb = getClosedBillingCycle(31, new Date(2026, 1, 28));
      expect(toLocalDateKey(feb.cycleStart)).toBe("2026-02-01");
      expect(toLocalDateKey(feb.cycleEnd)).toBe("2026-02-28");

      const apr = getClosedBillingCycle(31, new Date(2026, 3, 30));
      expect(toLocalDateKey(apr.cycleStart)).toBe("2026-04-01");
      expect(toLocalDateKey(apr.cycleEnd)).toBe("2026-04-30");
    });

    it("keeps a 30th card on the 30th in 31-day months, and last day in February", () => {
      const jan = getClosedBillingCycle(30, new Date(2026, 0, 31));
      expect(toLocalDateKey(jan.cycleStart)).toBe("2025-12-31");
      expect(toLocalDateKey(jan.cycleEnd)).toBe("2026-01-30");

      const feb = getClosedBillingCycle(30, new Date(2026, 1, 28));
      expect(toLocalDateKey(feb.cycleStart)).toBe("2026-01-31");
      expect(toLocalDateKey(feb.cycleEnd)).toBe("2026-02-28");
    });

    it("rolls December bill cycles into the next year", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 11, 20, 12, 0, 0)); // 20 Dec

      const { previousBillDate, nextBillDate } = getBillingCycleDates(1);

      expect(toLocalDateKey(previousBillDate)).toBe("2026-12-01");
      expect(toLocalDateKey(nextBillDate)).toBe("2027-01-01");
    });

    it("closes a 21st-cycle statement the day after the last generation date", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 21, 12, 0, 0));

      const { cycleStart, cycleEnd } = getClosedBillingCycle(21);
      expect(toLocalDateKey(cycleStart)).toBe("2026-07-22");
      expect(toLocalDateKey(cycleEnd)).toBe("2026-08-21");
      // 21 Jul closed the previous statement, so it must not appear here too.
      expect(isDateKeyInInclusiveRange("2026-07-21", cycleStart, cycleEnd)).toBe(
        false
      );
      expect(isDateKeyInInclusiveRange("2026-07-22", cycleStart, cycleEnd)).toBe(
        true
      );
      expect(isDateKeyInInclusiveRange("2026-08-01", cycleStart, cycleEnd)).toBe(
        true
      );
      expect(isDateKeyInInclusiveRange("2026-08-21", cycleStart, cycleEnd)).toBe(
        true
      );
      expect(isDateKeyInInclusiveRange("2026-08-22", cycleStart, cycleEnd)).toBe(
        false
      );
    });

    it("opens the unbilled window the day after the last generation date", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 25, 12, 0, 0));

      const { cycleStart, cycleEnd } = getOpenBillingCycle(21);
      expect(toLocalDateKey(cycleStart)).toBe("2026-08-22");
      expect(toLocalDateKey(cycleEnd)).toBe("2026-09-21");
    });
  });

  describe("getDaysUntilReset", () => {
    it("counts whole days remaining until next bill (ceil)", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0));
      const next = new Date(2026, 7, 15, 0, 0, 0);

      expect(getDaysUntilReset(next)).toBe(5);
    });

    it("returns 0 when next bill is in the past", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 16, 12, 0, 0));
      const next = new Date(2026, 7, 15, 0, 0, 0);

      expect(getDaysUntilReset(next)).toBeLessThanOrEqual(0);
    });
  });

  describe("getClosedBillingCycle — cyclesAgo (statement backfill)", () => {
    const window = (billDay: number, today: string, cyclesAgo: number) => {
      const { cycleStart, cycleEnd } = getClosedBillingCycle(
        billDay,
        new Date(today + "T12:00:00"),
        cyclesAgo
      );
      return `${toLocalDateKey(cycleStart)}..${toLocalDateKey(cycleEnd)}`;
    };

    it("walks back one contiguous cycle at a time", () => {
      expect(window(20, "2026-08-22", 0)).toBe("2026-07-21..2026-08-20");
      expect(window(20, "2026-08-22", 1)).toBe("2026-06-21..2026-07-20");
      expect(window(20, "2026-08-22", 2)).toBe("2026-05-21..2026-06-20");
    });

    it("treats cyclesAgo 0 as the latest closed cycle", () => {
      expect(window(20, "2026-08-22", 0)).toBe(
        window(20, "2026-08-22", -1)
      );
    });

    it("clamps month-end days when walking back through February", () => {
      // D=31 backfilling from Apr: Mar 1-31, Feb 1-28, Jan 1-31.
      expect(window(31, "2026-04-15", 0)).toBe("2026-03-01..2026-03-31");
      expect(window(31, "2026-04-15", 1)).toBe("2026-02-01..2026-02-28");
      expect(window(31, "2026-04-15", 2)).toBe("2026-01-01..2026-01-31");
    });

    it("keeps D=30 on the 30th in 31-day months while walking back", () => {
      expect(window(30, "2026-05-15", 0)).toBe("2026-03-31..2026-04-30");
      expect(window(30, "2026-05-15", 1)).toBe("2026-03-01..2026-03-30");
      expect(window(30, "2026-05-15", 2)).toBe("2026-01-31..2026-02-28");
    });

    it("never shares or skips a day across backfilled cycles", () => {
      for (const billDay of [1, 20, 28, 29, 30, 31]) {
        for (let i = 0; i < 11; i += 1) {
          const newer = getClosedBillingCycle(
            billDay,
            new Date("2026-08-22T12:00:00"),
            i
          );
          const older = getClosedBillingCycle(
            billDay,
            new Date("2026-08-22T12:00:00"),
            i + 1
          );
          const gapMs =
            newer.cycleStart.getTime() - older.cycleEnd.getTime();
          expect(gapMs).toBe(24 * 3600 * 1000);
        }
      }
    });
  });
});
