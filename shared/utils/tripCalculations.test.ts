import { describe, expect, it } from "vitest";
import type { Expense } from "@/shared/types/expense";
import type { Trip } from "@/shared/types/trip";
import {
  computeTripCategoryBreakdown,
  computeTripSpend,
  computeTripSummary,
  getTripDaysInfo,
  getTripStatus,
  isTripOverBudget,
} from "./tripCalculations";

const mockTrip: Trip = {
  id: "trip-1",
  userId: "user-1",
  destination: "Goa",
  tripName: "Goa Summer 2026",
  startDate: "2026-08-01",
  endDate: "2026-08-10",
  totalBudget: 30000,
  spentAmount: 12000,
  status: "active",
  createdAt: Date.now(),
  categoryBudgets: [
    { category: "Food & Dining", limit: 8000 },
    { category: "Transport", limit: 6000 },
    { category: "Accommodation", limit: 12000 },
  ],
};

const mockExpenses: Expense[] = [
  {
    id: "e1",
    amount: 3000,
    category: "Food & Dining",
    note: "Beach Shack Dinner",
    date: "2026-08-02",
    month: "2026-08",
    tripId: "trip-1",
    createdAt: Date.now(),
  },
  {
    id: "e2",
    amount: 5000,
    category: "Accommodation",
    note: "Resort 2 nights",
    date: "2026-08-01",
    month: "2026-08",
    tripId: "trip-1",
    createdAt: Date.now(),
  },
  {
    id: "e3",
    amount: 1500,
    category: "Transport",
    note: "Cab from airport",
    date: "2026-08-01",
    month: "2026-08",
    tripId: "trip-1",
    createdAt: Date.now(),
  },
  {
    id: "e4",
    amount: 2000,
    category: "Food & Dining",
    note: "Home delivery",
    date: "2026-07-25",
    month: "2026-07",
    // no tripId — should be excluded
    createdAt: Date.now(),
  },
];

describe("tripCalculations utilities", () => {
  describe("computeTripSpend", () => {
    it("sums only expenses linked to the given tripId", () => {
      const total = computeTripSpend(mockExpenses, "trip-1");
      expect(total).toBe(9500); // 3000 + 5000 + 1500
    });

    it("returns 0 when no expenses match the tripId", () => {
      const total = computeTripSpend(mockExpenses, "non-existent-trip");
      expect(total).toBe(0);
    });
  });

  describe("computeTripCategoryBreakdown", () => {
    it("returns per-category spend vs limit with percentage", () => {
      const breakdown = computeTripCategoryBreakdown(mockExpenses, mockTrip);
      const food = breakdown.find((b) => b.category === "Food & Dining");
      expect(food?.spent).toBe(3000);
      expect(food?.limit).toBe(8000);
      expect(food?.percentage).toBe(38); // floor(3000/8000 * 100)
      expect(food?.isOverBudget).toBe(false);
    });

    it("flags isOverBudget when spend exceeds category limit", () => {
      const overTrip: Trip = {
        ...mockTrip,
        categoryBudgets: [{ category: "Transport", limit: 1000 }],
      };
      const breakdown = computeTripCategoryBreakdown(mockExpenses, overTrip);
      const transport = breakdown.find((b) => b.category === "Transport");
      expect(transport?.spent).toBe(1500);
      expect(transport?.isOverBudget).toBe(true);
    });

    it("includes categories with spending but no explicit budget limit", () => {
      const tripNoBudgets: Trip = { ...mockTrip, categoryBudgets: [] };
      const breakdown = computeTripCategoryBreakdown(mockExpenses, tripNoBudgets);
      expect(breakdown.length).toBeGreaterThan(0);
      breakdown.forEach((b) => expect(b.limit).toBe(0));
    });
  });

  describe("getTripStatus", () => {
    it("returns upcoming when today is before startDate", () => {
      expect(getTripStatus(mockTrip, "2026-07-31")).toBe("upcoming");
    });

    it("returns active when today is within trip dates", () => {
      expect(getTripStatus(mockTrip, "2026-08-05")).toBe("active");
    });

    it("returns completed when today is after endDate", () => {
      expect(getTripStatus(mockTrip, "2026-08-11")).toBe("completed");
    });
  });

  describe("isTripOverBudget", () => {
    it("returns false when spentAmount is within totalBudget", () => {
      expect(isTripOverBudget(mockTrip)).toBe(false);
    });

    it("returns true when spentAmount exceeds totalBudget", () => {
      const overTrip: Trip = { ...mockTrip, spentAmount: 35000 };
      expect(isTripOverBudget(overTrip)).toBe(true);
    });
  });

  describe("getTripDaysInfo", () => {
    it("computes daysRemaining correctly for an active trip", () => {
      const info = getTripDaysInfo(mockTrip, "2026-08-05");
      expect(info.daysRemaining).toBeGreaterThan(0);
      expect(info.daysElapsed).toBeGreaterThan(0);
      expect(info.totalDays).toBeGreaterThanOrEqual(9);
    });
  });

  describe("computeTripSummary", () => {
    it("correctly counts active, upcoming, and completed trips", () => {
      const trips: Trip[] = [
        { ...mockTrip, id: "t1", startDate: "2026-08-01", endDate: "2026-08-10" },
        { ...mockTrip, id: "t2", startDate: "2026-09-01", endDate: "2026-09-10" },
        { ...mockTrip, id: "t3", startDate: "2026-07-01", endDate: "2026-07-15" },
      ];

      const summary = computeTripSummary(trips, "2026-08-05");
      expect(summary.activeCount).toBe(1);
      expect(summary.upcomingCount).toBe(1);
      expect(summary.completedCount).toBe(1);
    });
  });
});
