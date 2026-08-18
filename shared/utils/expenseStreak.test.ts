import { describe, expect, it } from "vitest";
import type { Expense } from "@/shared/types/expense";
import { createDefaultUserStats } from "@/shared/types/stats";
import {
  buildLoggingStreakUpdate,
  computeExpenseStreak,
  computeLongestExpenseStreak,
  expenseDateKey,
} from "./expenseStreak";

function expense(date: string, id = date): Expense {
  return {
    id,
    amount: 50,
    category: "Food",
    note: "Logged",
    date,
    month: date.slice(0, 7),
    createdAt: date,
  };
}

describe("expenseStreak", () => {
  describe("expenseDateKey", () => {
    it("accepts calendar keys and ISO datetimes", () => {
      expect(expenseDateKey("2026-08-18")).toBe("2026-08-18");
      expect(expenseDateKey("2026-08-18T10:15:00.000Z")).toBe("2026-08-18");
      expect(expenseDateKey("not-a-date")).toBeNull();
      expect(expenseDateKey("")).toBeNull();
    });
  });

  describe("computeExpenseStreak", () => {
    it("counts consecutive days logged through today", () => {
      const expenses = [
        expense("2026-08-05"),
        expense("2026-08-04"),
        expense("2026-08-03"),
      ];
      expect(computeExpenseStreak(expenses, "2026-08-05")).toBe(3);
    });

    it("keeps yesterday's streak if today is not logged yet", () => {
      const expenses = [expense("2026-08-04"), expense("2026-08-03")];
      expect(computeExpenseStreak(expenses, "2026-08-05")).toBe(2);
    });

    it("returns 0 when both today and yesterday are missing", () => {
      const expenses = [expense("2026-08-03")];
      expect(computeExpenseStreak(expenses, "2026-08-05")).toBe(0);
    });

    it("walks across month boundaries without UTC shift", () => {
      const expenses = [
        expense("2026-08-01"),
        expense("2026-07-31"),
        expense("2026-07-30"),
      ];
      expect(computeExpenseStreak(expenses, "2026-08-01")).toBe(3);
    });

    it("normalizes ISO datetime expense dates", () => {
      const expenses = [
        expense("2026-08-05T18:00:00.000Z"),
        expense("2026-08-04T09:00:00.000Z"),
      ];
      expect(computeExpenseStreak(expenses, "2026-08-05")).toBe(2);
    });

    it("ignores gaps older than the current run", () => {
      const expenses = [
        expense("2026-08-05"),
        expense("2026-08-04"),
        expense("2026-08-01"),
      ];
      expect(computeExpenseStreak(expenses, "2026-08-05")).toBe(2);
    });
  });

  describe("computeLongestExpenseStreak", () => {
    it("finds the longest historical consecutive run", () => {
      const expenses = [
        expense("2026-08-01"),
        expense("2026-08-02"),
        expense("2026-08-03"),
        expense("2026-08-10"),
        expense("2026-08-11"),
      ];
      expect(computeLongestExpenseStreak(expenses)).toBe(3);
    });

    it("returns 0 for empty history", () => {
      expect(computeLongestExpenseStreak([])).toBe(0);
    });
  });

  describe("buildLoggingStreakUpdate", () => {
    it("backfills a stale stored streak of 0 from expense history", () => {
      const stats = {
        ...createDefaultUserStats("2026-08-01"),
        currentStreak: 0,
        longestStreak: 0,
      };
      const expenses = [
        expense("2026-08-05"),
        expense("2026-08-04"),
        expense("2026-08-03"),
        expense("2026-08-02"),
        expense("2026-08-01"),
      ];
      const update = buildLoggingStreakUpdate(
        stats,
        expenses,
        "2026-08-05",
        createDefaultUserStats("2026-08-05")
      );

      expect(update.shouldPersist).toBe(true);
      expect(update.next.currentStreak).toBe(5);
      expect(update.next.longestStreak).toBe(5);
      expect(update.persistPatch.lastLoginDate).toBe("2026-08-05");
    });

    it("awards the 7-day streak badge when backfill reaches 7", () => {
      const expenses = Array.from({ length: 7 }, (_, i) => {
        const day = String(i + 1).padStart(2, "0");
        return expense(`2026-08-${day}`);
      });
      const update = buildLoggingStreakUpdate(
        createDefaultUserStats("2026-08-01"),
        expenses,
        "2026-08-07",
        createDefaultUserStats("2026-08-07")
      );

      expect(update.next.currentStreak).toBe(7);
      expect(update.next.badges).toContain("streak_7");
      expect(update.shouldPersist).toBe(true);
    });

    it("does not persist when stored streak already matches history", () => {
      const expenses = [expense("2026-08-05"), expense("2026-08-04")];
      const stats = {
        ...createDefaultUserStats("2026-08-05"),
        currentStreak: 2,
        longestStreak: 2,
        badges: ["no_spend"],
      };
      const update = buildLoggingStreakUpdate(
        stats,
        expenses,
        "2026-08-05",
        createDefaultUserStats("2026-08-05")
      );

      expect(update.shouldPersist).toBe(false);
      expect(update.next.currentStreak).toBe(2);
    });

    it("never lowers longestStreak when the current run is shorter", () => {
      const stats = {
        ...createDefaultUserStats("2026-08-05"),
        currentStreak: 1,
        longestStreak: 12,
      };
      const update = buildLoggingStreakUpdate(
        stats,
        [expense("2026-08-05")],
        "2026-08-05",
        createDefaultUserStats("2026-08-05")
      );

      expect(update.next.currentStreak).toBe(1);
      expect(update.next.longestStreak).toBe(12);
      expect(update.shouldPersist).toBe(false);
    });
  });
});
