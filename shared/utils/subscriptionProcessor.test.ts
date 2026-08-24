import { describe, expect, it } from "vitest";
import type { Subscription } from "@/shared/types/subscription";
import {
  buildExpenseFromSubscription,
  buildTransferFromSubscription,
  computeMonthlyCommitments,
  evaluateSubscriptionDue,
  getNextRenewalDate,
  planDueSubscriptionPosts,
  applyPostPlanToSubscriptions,
} from "./subscriptionProcessor";

describe("subscriptionProcessor utilities", () => {
  const mockSub: Subscription = {
    id: "sub-1",
    name: "Netflix 4K",
    amount: 649,
    category: "Entertainment",
    dayOfMonth: 10,
    isActive: true,
    lastProcessed: "2026-07",
    type: "subscription",
  };

  const mockEmi: Subscription = {
    id: "emi-1",
    name: "Car Loan",
    amount: 15000,
    category: "EMIs & Loans",
    dayOfMonth: 5,
    isActive: true,
    lastProcessed: "2026-07",
    type: "emi",
    endMonth: 8,
    endYear: 2026,
  };

  const mockTransfer: Subscription = {
    id: "tr-1",
    name: "Monthly Savings",
    amount: 10000,
    category: "Transfers",
    dayOfMonth: 1,
    isActive: true,
    lastProcessed: "2026-08",
    type: "transfer",
    accountId: "acc-bank-1",
    toAccountId: "acc-bank-2",
  };

  describe("evaluateSubscriptionDue", () => {
    it("returns isDue: true when current day is on or after dayOfMonth and not processed", () => {
      const evalDate = new Date("2026-08-10T12:00:00Z");
      const result = evaluateSubscriptionDue(mockSub, evalDate);

      expect(result.isDue).toBe(true);
      expect(result.monthKey).toBe("2026-08");
      expect(result.targetDateStr).toBe("2026-08-10");
    });

    it("returns isDue: false when current day is before dayOfMonth", () => {
      const evalDate = new Date("2026-08-05T12:00:00Z");
      const result = evaluateSubscriptionDue(mockSub, evalDate);

      expect(result.isDue).toBe(false);
    });

    it("returns isDue: false when already processed for active month", () => {
      const evalDate = new Date("2026-08-15T12:00:00Z");
      const subAlreadyProcessed: Subscription = {
        ...mockSub,
        lastProcessed: "2026-08",
      };
      const result = evaluateSubscriptionDue(subAlreadyProcessed, evalDate);

      expect(result.isDue).toBe(false);
    });

    it("identifies EMI term completion on final month", () => {
      const evalDate = new Date("2026-08-10T12:00:00Z");
      const result = evaluateSubscriptionDue(mockEmi, evalDate);

      expect(result.isDue).toBe(true);
      expect(result.isCompleted).toBe(true);
    });

    it("clamps billing day to days in month (e.g. day 31 on 30-day month)", () => {
      const subEndMonth: Subscription = {
        ...mockSub,
        dayOfMonth: 31,
        lastProcessed: "2026-08",
      };
      const evalDate = new Date("2026-09-30T12:00:00Z");
      const result = evaluateSubscriptionDue(subEndMonth, evalDate);

      expect(result.isDue).toBe(true);
      expect(result.targetDateStr).toBe("2026-09-30");
    });
  });

  describe("buildExpenseFromSubscription & buildTransferFromSubscription", () => {
    it("builds correct expense payload for standard subscription", () => {
      const payload = buildExpenseFromSubscription(mockSub, "2026-08-10", "2026-08");

      expect(payload.amount).toBe(649);
      expect(payload.category).toBe("Entertainment");
      expect(payload.note).toBe("[Subscription] Netflix 4K");
      expect(payload.isRecurring).toBe(true);
      expect(payload.subscriptionId).toBe("sub-1");
    });

    it("builds correct expense payload with [EMI] prefix for loan", () => {
      const payload = buildExpenseFromSubscription(mockEmi, "2026-08-05", "2026-08");

      expect(payload.amount).toBe(15000);
      expect(payload.note).toBe("[EMI] Car Loan");
      expect(payload.isRecurring).toBe(true);
    });

    it("builds correct account transfer payload for recurring transfer", () => {
      const payload = buildTransferFromSubscription(mockTransfer, "2026-08-01");

      expect(payload.amount).toBe(10000);
      expect(payload.fromAccountId).toBe("acc-bank-1");
      expect(payload.toAccountId).toBe("acc-bank-2");
      expect(payload.note).toBe("[Auto-Transfer] Monthly Savings");
    });
  });

  describe("getNextRenewalDate", () => {
    it("computes next scheduled billing date and days remaining", () => {
      const evalDate = new Date("2026-08-01T00:00:00Z");
      const result = getNextRenewalDate(mockSub, evalDate);

      expect(result.dateStr).toBe("2026-08-10");
      expect(result.daysRemaining).toBe(9);
    });

    it("rolls over to next month if already past day in current month", () => {
      const evalDate = new Date("2026-08-15T00:00:00Z");
      const result = getNextRenewalDate(mockSub, evalDate);

      expect(result.dateStr).toBe("2026-09-10");
      expect(result.daysRemaining).toBeGreaterThan(0);
    });
  });

  describe("computeMonthlyCommitments", () => {
    it("aggregates total monthly commitment, counts, and category totals", () => {
      const list: Subscription[] = [mockSub, mockEmi, mockTransfer];
      const summary = computeMonthlyCommitments(list);

      expect(summary.totalMonthly).toBe(649 + 15000 + 10000);
      expect(summary.activeCount).toBe(3);
      expect(summary.subscriptionsTotal).toBe(649);
      expect(summary.emisTotal).toBe(15000);
      expect(summary.transfersTotal).toBe(10000);
    });

    it("excludes completed and inactive subscriptions from commitment total", () => {
      const completedEmi: Subscription = {
        ...mockEmi,
        isCompleted: true,
        isActive: false,
      };
      const pausedSub: Subscription = {
        ...mockSub,
        isActive: false,
      };

      const summary = computeMonthlyCommitments([completedEmi, pausedSub]);
      expect(summary.totalMonthly).toBe(0);
      expect(summary.activeCount).toBe(0);
      expect(summary.completedCount).toBe(1);
    });
  });

  describe("planDueSubscriptionPosts idempotency", () => {
    it("plans expense + transfer actions, then no-ops after lastProcessed apply", () => {
      const evalDate = new Date(2026, 7, 15, 12, 0, 0); // 15 Aug local
      const list: Subscription[] = [
        { ...mockSub, lastProcessed: "2026-07" },
        { ...mockTransfer, lastProcessed: "2026-07", dayOfMonth: 1 },
      ];

      const firstPlan = planDueSubscriptionPosts(list, evalDate);
      expect(firstPlan).toHaveLength(2);
      expect(firstPlan.map((a) => a.kind).sort()).toEqual(["expense", "transfer"]);

      const afterPost = applyPostPlanToSubscriptions(list, firstPlan);
      const secondPlan = planDueSubscriptionPosts(afterPost, evalDate);
      expect(secondPlan).toHaveLength(0);
    });

    it("marks EMI completed on final month plan", () => {
      const evalDate = new Date(2026, 7, 10, 12, 0, 0);
      const plan = planDueSubscriptionPosts(
        [{ ...mockEmi, lastProcessed: "2026-07" }],
        evalDate
      );
      expect(plan).toHaveLength(1);
      expect(plan[0]?.markCompleted).toBe(true);

      const updated = applyPostPlanToSubscriptions(
        [{ ...mockEmi, lastProcessed: "2026-07" }],
        plan
      );
      expect(updated[0]?.isCompleted).toBe(true);
      expect(updated[0]?.isActive).toBe(false);
      expect(planDueSubscriptionPosts(updated, evalDate)).toHaveLength(0);
    });
  });

  describe("every_n_days cadence", () => {
    const chicken: Subscription = {
      id: "sub-chicken",
      name: "Chicken",
      amount: 200,
      category: "Food",
      dayOfMonth: 1,
      frequency: "every_n_days",
      intervalDays: 2,
      isActive: true,
      lastProcessed: "2026-08",
      lastProcessedDate: "2026-08-10",
      type: "subscription",
    };

    it("is due when interval days have elapsed", () => {
      const result = evaluateSubscriptionDue(
        chicken,
        new Date(2026, 7, 12, 12, 0, 0)
      );
      expect(result.isDue).toBe(true);
      expect(result.targetDateStr).toBe("2026-08-12");
      expect(result.lastProcessedDate).toBe("2026-08-12");
    });

    it("is not due before the next interval", () => {
      const result = evaluateSubscriptionDue(
        chicken,
        new Date(2026, 7, 11, 12, 0, 0)
      );
      expect(result.isDue).toBe(false);
    });

    it("posts at most once per run and is idempotent after apply", () => {
      const evalDate = new Date(2026, 7, 16, 12, 0, 0);
      const firstPlan = planDueSubscriptionPosts([chicken], evalDate);
      expect(firstPlan).toHaveLength(1);
      expect(firstPlan[0]?.kind).toBe("expense");
      expect(firstPlan[0]?.lastProcessedDate).toBe("2026-08-12");

      const afterPost = applyPostPlanToSubscriptions([chicken], firstPlan);
      expect(afterPost[0]?.lastProcessedDate).toBe("2026-08-12");
      expect(planDueSubscriptionPosts(afterPost, new Date(2026, 7, 12, 12, 0, 0))).toHaveLength(0);
    });

    it("includes interval items in monthly commitments as a 30-day equivalent", () => {
      const summary = computeMonthlyCommitments([chicken]);
      expect(summary.subscriptionsTotal).toBe(200 * (30 / 2));
      expect(summary.totalMonthly).toBe(3000);
    });
  });
});
