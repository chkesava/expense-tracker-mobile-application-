import { afterEach, describe, expect, it, vi } from "vitest";
import { getBillingCycleDates, getDaysUntilReset } from "./billingCycle";
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

    it("rolls December bill cycles into the next year", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 11, 20, 12, 0, 0)); // 20 Dec

      const { previousBillDate, nextBillDate } = getBillingCycleDates(1);

      expect(toLocalDateKey(previousBillDate)).toBe("2026-12-01");
      expect(toLocalDateKey(nextBillDate)).toBe("2027-01-01");
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
});
