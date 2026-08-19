import { describe, expect, it } from "vitest";
import type { Participant, Split } from "@/shared/types/split";
import {
  calculateEqualSplits,
  computeCollectSpendBreakdown,
  computeSplitProgress,
  computeSplitSummary,
  generateSplitShareMessage,
  othersFullyCollected,
  validateCustomSplits,
} from "./splitMath";

describe("splitMath utilities", () => {
  describe("calculateEqualSplits", () => {
    it("splits equally among 2 participants", () => {
      const parts = calculateEqualSplits(1000, [
        { name: "You", isCurrentUser: true },
        { name: "Alice", isCurrentUser: false },
      ]);

      expect(parts.length).toBe(2);
      expect(parts[0].amount + parts[1].amount).toBeCloseTo(1000, 2);
      expect(parts[0].isCurrentUser).toBe(true);
      expect(parts[0].paid).toBe(true); // Creator pre-marked paid
      expect(parts[1].paid).toBe(false);
    });

    it("handles fractional cent distribution cleanly for 3 participants", () => {
      const parts = calculateEqualSplits(1000, [
        { name: "You", isCurrentUser: true },
        { name: "Alice", isCurrentUser: false },
        { name: "Bob", isCurrentUser: false },
      ]);

      const total = parts.reduce((sum, p) => sum + p.amount, 0);
      expect(Math.round(total * 100) / 100).toBe(1000);
      // Fractional remainder should go to first participant
      expect(parts[1].amount).toBe(parts[2].amount);
    });

    it("returns empty array for empty participants", () => {
      expect(calculateEqualSplits(500, [])).toEqual([]);
    });

    it("returns empty array for zero amount", () => {
      expect(calculateEqualSplits(0, [{ name: "You", isCurrentUser: true }])).toEqual([]);
    });
  });

  describe("validateCustomSplits", () => {
    it("returns isValid: true when custom amounts sum to total", () => {
      const participants: Participant[] = [
        { name: "You", amount: 600, paid: true, isCurrentUser: true },
        { name: "Alice", amount: 400, paid: false, isCurrentUser: false },
      ];
      const result = validateCustomSplits(1000, participants);
      expect(result.isValid).toBe(true);
      expect(result.difference).toBeCloseTo(0, 2);
    });

    it("returns isValid: false with non-zero difference", () => {
      const participants: Participant[] = [
        { name: "You", amount: 500, paid: true, isCurrentUser: true },
        { name: "Alice", amount: 300, paid: false, isCurrentUser: false },
      ];
      const result = validateCustomSplits(1000, participants);
      expect(result.isValid).toBe(false);
      expect(result.difference).toBeCloseTo(200, 2);
    });
  });

  describe("computeSplitProgress", () => {
    it("calculates correct progress percentage when some participants paid", () => {
      const split: Split = {
        id: "s1",
        title: "Dinner",
        totalAmount: 1000,
        splitType: "equal",
        createdBy: "user-1",
        createdAt: Date.now(),
        settled: false,
        participantIds: ["user-1"],
        participants: [
          { name: "You", amount: 500, paid: true, isCurrentUser: true },
          { name: "Alice", amount: 500, paid: false, isCurrentUser: false },
        ],
      };

      const result = computeSplitProgress(split);
      expect(result.settledAmount).toBe(500);
      expect(result.percentage).toBe(50);
      expect(result.isFullySettled).toBe(false);
      expect(result.unpaidCount).toBe(1);
    });

    it("returns 100% when all participants paid", () => {
      const split: Split = {
        id: "s2",
        title: "BBQ",
        totalAmount: 600,
        splitType: "equal",
        createdBy: "user-1",
        createdAt: Date.now(),
        settled: false,
        participantIds: [],
        participants: [
          { name: "You", amount: 300, paid: true, isCurrentUser: true },
          { name: "Bob", amount: 300, paid: true, isCurrentUser: false },
        ],
      };

      const result = computeSplitProgress(split);
      expect(result.percentage).toBe(100);
      expect(result.isFullySettled).toBe(true);
      expect(result.unpaidCount).toBe(0);
    });
  });

  describe("computeSplitSummary", () => {
    it("computes owed amounts from splits the user created", () => {
      const splits: Split[] = [
        {
          id: "s1",
          title: "Goa Trip",
          totalAmount: 3000,
          splitType: "equal",
          createdBy: "user-me",
          createdAt: Date.now(),
          settled: false,
          participantIds: ["user-me", "user-alice"],
          participants: [
            { name: "Me", amount: 1500, paid: true, isCurrentUser: true },
            { name: "Alice", amount: 1500, paid: false, isCurrentUser: false, userId: "user-alice" },
          ],
        },
      ];

      const summary = computeSplitSummary(splits, "user-me");
      expect(summary.totalOwedToYou).toBe(1500);
      expect(summary.totalYouOwe).toBe(0);
      expect(summary.activeCount).toBe(1);
      expect(summary.settledCount).toBe(0);
    });

    it("identifies amounts user owes in splits created by others", () => {
      const splits: Split[] = [
        {
          id: "s2",
          title: "Movie Night",
          totalAmount: 800,
          splitType: "equal",
          createdBy: "user-alice",
          createdAt: Date.now(),
          settled: false,
          participantIds: ["user-alice", "user-me"],
          participants: [
            { name: "Alice", amount: 400, paid: true, isCurrentUser: false },
            { name: "Me", amount: 400, paid: false, isCurrentUser: true, userId: "user-me" },
          ],
        },
      ];

      const summary = computeSplitSummary(splits, "user-me");
      expect(summary.totalYouOwe).toBe(400);
      expect(summary.totalOwedToYou).toBe(0);
    });
  });

  describe("generateSplitShareMessage", () => {
    it("generates reminder message with UPI link when upiId provided", () => {
      const split: Split = {
        id: "s1",
        title: "Weekend BBQ",
        totalAmount: 1500,
        splitType: "equal",
        createdBy: "user-me",
        createdByName: "Kesava",
        createdAt: Date.now(),
        settled: false,
        participantIds: [],
        participants: [],
      };

      const participant: Participant = {
        name: "Alice",
        amount: 500,
        paid: false,
        isCurrentUser: false,
      };

      const message = generateSplitShareMessage(split, participant, "kesava@okaxis", "INR");
      expect(message).toContain("Alice");
      expect(message).toContain("Weekend BBQ");
      expect(message).toContain("500.00");
      expect(message).toContain("upi://pay");
    });

    it("generates message without UPI link when no creator upiId", () => {
      const split: Split = {
        id: "s1",
        title: "Dinner",
        totalAmount: 1000,
        splitType: "equal",
        createdBy: "user-me",
        createdAt: Date.now(),
        settled: false,
        participantIds: [],
        participants: [],
      };

      const participant: Participant = {
        name: "Bob",
        amount: 250,
        paid: false,
        isCurrentUser: false,
      };

      const message = generateSplitShareMessage(split, participant, undefined, "INR");
      expect(message).toContain("Dinner");
      expect(message).toContain("250.00");
      expect(message).not.toContain("upi://pay");
    });

    it("appends a payment page URL when provided", () => {
      const split: Split = {
        id: "s1",
        title: "Wedding gift",
        totalAmount: 4000,
        splitType: "equal",
        createdBy: "user-me",
        createdByName: "Kesava",
        createdAt: Date.now(),
        settled: false,
        participantIds: [],
        participants: [],
      };
      const participant: Participant = {
        name: "Alice",
        amount: 1000,
        paid: false,
        isCurrentUser: false,
      };
      const message = generateSplitShareMessage(
        split,
        participant,
        "kesava@okaxis",
        "INR",
        "https://app.example/payment/abc"
      );
      expect(message).toContain("https://app.example/payment/abc");
      expect(message).toContain("upi://pay");
    });
  });

  describe("collect spend math", () => {
    it("treats organizer share as out-of-pocket after friends are collected", () => {
      const split: Split = {
        id: "s1",
        title: "Gift",
        totalAmount: 4000,
        splitType: "equal",
        createdBy: "me",
        createdAt: 1,
        settled: false,
        participantIds: [],
        kind: "collect",
        participants: [
          { name: "You", amount: 1000, paid: true, isCurrentUser: true },
          { name: "A", amount: 1000, paid: true, isCurrentUser: false },
          { name: "B", amount: 1000, paid: true, isCurrentUser: false },
          { name: "C", amount: 1000, paid: false, isCurrentUser: false },
        ],
      };
      expect(othersFullyCollected(split)).toBe(false);
      const full = {
        ...split,
        participants: split.participants.map((p) => ({ ...p, paid: true })),
      };
      expect(othersFullyCollected(full)).toBe(true);
      const math = computeCollectSpendBreakdown(full, 4000);
      expect(math.othersCollected).toBe(3000);
      expect(math.ownExpense).toBe(1000);
      expect(math.passThroughDebit).toBe(3000);
    });
  });
});
