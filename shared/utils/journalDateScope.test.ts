import { describe, expect, it } from "vitest";

import { resolveJournalDateScope } from "./journalDateScope";

const none = { fromDate: "", toDate: "" };

describe("journal date scope (SPENDLY-109)", () => {
  describe("month scope", () => {
    it("expands a month key to its first and last day", () => {
      expect(resolveJournalDateScope("2026-09", none)).toEqual({
        fromDate: "2026-09-01",
        toDate: "2026-09-30",
        monthOverridden: false,
        monthKey: "2026-09",
      });
    });

    it("handles a 31-day month", () => {
      const scope = resolveJournalDateScope("2026-01", none);
      expect(scope.toDate).toBe("2026-01-31");
    });

    it("handles a leap February", () => {
      expect(resolveJournalDateScope("2024-02", none).toDate).toBe("2024-02-29");
    });

    it("handles a non-leap February", () => {
      expect(resolveJournalDateScope("2023-02", none).toDate).toBe("2023-02-28");
    });

    it("pads a single-digit last day boundary correctly", () => {
      // April has 30 days; the padding path must not emit "2026-04-3".
      expect(resolveJournalDateScope("2026-04", none).toDate).toBe("2026-04-30");
    });
  });

  describe("range override", () => {
    it("lets a full range replace the month", () => {
      expect(
        resolveJournalDateScope("2026-09", {
          fromDate: "2026-01-01",
          toDate: "2026-03-31",
        })
      ).toEqual({
        fromDate: "2026-01-01",
        toDate: "2026-03-31",
        monthOverridden: true,
        monthKey: "2026-09",
      });
    });

    it("keeps a from-only range open-ended rather than clamping to the month", () => {
      const scope = resolveJournalDateScope("2026-09", {
        fromDate: "2024-01-01",
        toDate: "",
      });
      expect(scope.monthOverridden).toBe(true);
      expect(scope.fromDate).toBe("2024-01-01");
      // Clamping here would silently turn "everything since 2024" into
      // "only September 2026".
      expect(scope.toDate).toBe("");
    });

    it("keeps a to-only range open-ended", () => {
      const scope = resolveJournalDateScope("2026-09", {
        fromDate: "",
        toDate: "2024-12-31",
      });
      expect(scope.monthOverridden).toBe(true);
      expect(scope.fromDate).toBe("");
      expect(scope.toDate).toBe("2024-12-31");
    });

    it("still reports the month the pill displays while overridden", () => {
      expect(
        resolveJournalDateScope("2026-09", {
          fromDate: "2026-01-01",
          toDate: "",
        }).monthKey
      ).toBe("2026-09");
    });

    it("restores month scope when the range is cleared", () => {
      const overridden = resolveJournalDateScope("2026-09", {
        fromDate: "2026-01-01",
        toDate: "2026-03-31",
      });
      const cleared = resolveJournalDateScope("2026-09", none);
      expect(overridden.monthOverridden).toBe(true);
      expect(cleared.monthOverridden).toBe(false);
      expect(cleared).toEqual(resolveJournalDateScope("2026-09", none));
      expect(cleared.fromDate).toBe("2026-09-01");
    });

    it("treats whitespace-only dates as no range", () => {
      const scope = resolveJournalDateScope("2026-09", {
        fromDate: "   ",
        toDate: "",
      });
      expect(scope.monthOverridden).toBe(false);
      expect(scope.fromDate).toBe("2026-09-01");
    });
  });

  describe("absent or malformed month", () => {
    it.each(["", "2026-13", "2026-00", "garbage", "2026"])(
      "leaves scope open for %j rather than throwing",
      (monthKey) => {
        expect(resolveJournalDateScope(monthKey, none)).toEqual({
          fromDate: "",
          toDate: "",
          monthOverridden: false,
          monthKey: monthKey.trim(),
        });
      }
    );

    it("leaves scope open when the month key is undefined", () => {
      expect(resolveJournalDateScope(undefined, none)).toEqual({
        fromDate: "",
        toDate: "",
        monthOverridden: false,
        monthKey: "",
      });
    });

    it("still honours an explicit range with no month at all", () => {
      const scope = resolveJournalDateScope(undefined, {
        fromDate: "2026-02-01",
        toDate: "2026-02-28",
      });
      expect(scope.monthOverridden).toBe(true);
      expect(scope.fromDate).toBe("2026-02-01");
    });
  });
});
