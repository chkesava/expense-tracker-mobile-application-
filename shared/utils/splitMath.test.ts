import { describe, expect, it } from "vitest";
import type { Participant, Split } from "@/shared/types/split";
import {
  calculateEqualSplits,
  computeCollectSpendBreakdown,
  computeSplitProgress,
  computeSplitSummary,
  generateSplitGroupShareMessage,
  generateSplitShareMessage,
  othersFullyCollected,
  participantPaidAmount,
  participantRemainingDue,
  recalibrateSplitAfterAddParticipant,
  recalibrateSplitAfterAmountChange,
  recalibrateSplitAfterOptOut,
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

    it("does not treat a top-up as settled when paidAmount is below the new share", () => {
      const split: Split = {
        id: "s-partial",
        title: "Dinner",
        totalAmount: 1000,
        splitType: "equal",
        createdBy: "user-1",
        createdAt: Date.now(),
        settled: false,
        participantIds: [],
        participants: [
          {
            key: "you",
            name: "You",
            amount: 125,
            paid: false,
            paidAmount: 100,
            isCurrentUser: true,
          },
          {
            key: "a",
            name: "Alice",
            amount: 125,
            paid: false,
            paidAmount: 100,
            isCurrentUser: false,
          },
        ],
      };
      const result = computeSplitProgress(split);
      expect(result.settledAmount).toBe(200);
      expect(result.isFullySettled).toBe(false);
      expect(result.unpaidCount).toBe(2);
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

    it("includes remaining due when someone already paid part of a new share", () => {
      const split: Split = {
        id: "s1",
        title: "Dinner",
        totalAmount: 1000,
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
        amount: 125,
        paid: false,
        paidAmount: 100,
        isCurrentUser: false,
      };
      const message = generateSplitShareMessage(split, participant, undefined, "INR");
      expect(message).toContain("Amount still due");
      expect(message).toContain("25.00");
      expect(message).toContain("125.00");
      expect(message).toContain("100.00");
    });
  });

  describe("generateSplitGroupShareMessage", () => {
    it("lists remaining dues and the public split URL", () => {
      const split: Split = {
        id: "s1",
        title: "Goa",
        totalAmount: 1000,
        splitType: "equal",
        createdBy: "me",
        createdAt: 1,
        settled: false,
        participantIds: [],
        participants: [
          { name: "You", amount: 500, paid: true, paidAmount: 500, isCurrentUser: true },
          { name: "Alice", amount: 500, paid: false, paidAmount: 0, isCurrentUser: false },
        ],
      };
      const message = generateSplitGroupShareMessage(
        split,
        "INR",
        "https://app.example/split/abc"
      );
      expect(message).toContain("Goa");
      expect(message).toContain("Alice");
      expect(message).toContain("500.00");
      expect(message).toContain("https://app.example/split/abc");
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

  describe("recalibrateSplitAfterOptOut", () => {
    function tenWayDinner(paidCount: number): Split {
      const participants: Participant[] = Array.from({ length: 10 }, (_, i) => ({
        key: `p${i}`,
        name: i === 0 ? "You" : `Friend ${i}`,
        amount: 100,
        paid: i < paidCount,
        paidAmount: i < paidCount ? 100 : 0,
        isCurrentUser: i === 0,
      }));
      return {
        id: "s-10",
        title: "Dinner",
        totalAmount: 1000,
        splitType: "equal",
        createdBy: "me",
        createdAt: 1,
        settled: false,
        participantIds: [],
        participants,
      };
    }

    it("moves 10 equal ₹100 shares to 8 at ₹125 with ₹25 still due after two unpaid dropouts", () => {
      const split = tenWayDinner(8);
      const first = recalibrateSplitAfterOptOut(split, "p8");
      expect("error" in first).toBe(false);
      if ("error" in first) return;
      const second = recalibrateSplitAfterOptOut(
        { ...split, participants: first.participants },
        "p9"
      );
      expect("error" in second).toBe(false);
      if ("error" in second) return;

      const contributing = second.participants.filter((p) => p.contributing !== false);
      expect(contributing).toHaveLength(8);
      expect(contributing.reduce((sum, p) => sum + p.amount, 0)).toBeCloseTo(1000, 2);
      for (const p of contributing) {
        expect(p.amount).toBe(125);
        expect(participantPaidAmount(p)).toBe(100);
        expect(participantRemainingDue(p)).toBe(25);
        expect(p.paid).toBe(false);
      }
      expect(second.participants[8].contributing).toBe(false);
      expect(second.participants[9].amount).toBe(0);
      expect(second.settled).toBe(false);
    });

    it("rescales custom amounts so remaining people still sum to the total", () => {
      const split: Split = {
        id: "s-custom",
        title: "Custom",
        totalAmount: 1000,
        splitType: "custom",
        createdBy: "me",
        createdAt: 1,
        settled: false,
        participantIds: [],
        participants: [
          { key: "you", name: "You", amount: 400, paid: true, paidAmount: 400, isCurrentUser: true },
          { key: "a", name: "A", amount: 350, paid: false, paidAmount: 0, isCurrentUser: false },
          { key: "b", name: "B", amount: 250, paid: false, paidAmount: 0, isCurrentUser: false },
        ],
      };
      const result = recalibrateSplitAfterOptOut(split, "b");
      expect("error" in result).toBe(false);
      if ("error" in result) return;
      const contributing = result.participants.filter((p) => p.contributing !== false);
      expect(contributing).toHaveLength(2);
      expect(contributing.reduce((sum, p) => sum + p.amount, 0)).toBeCloseTo(1000, 2);
      expect(result.participants[2].contributing).toBe(false);
      expect(result.participants[0].amount).toBeGreaterThan(400);
      expect(participantRemainingDue(result.participants[0])).toBeCloseTo(
        result.participants[0].amount - 400,
        2
      );
    });

    it("blocks opting out the organizer or the last contributor", () => {
      const split = tenWayDinner(1);
      expect(recalibrateSplitAfterOptOut(split, "p0")).toEqual({
        error: "You can't drop yourself from a split you organized.",
      });
      const lastOnly: Split = {
        ...split,
        participants: [
          {
            key: "gone",
            name: "Gone",
            amount: 0,
            paid: true,
            contributing: false,
            isCurrentUser: false,
          },
          {
            key: "last",
            name: "Last",
            amount: 1000,
            paid: false,
            isCurrentUser: false,
          },
        ],
      };
      expect(recalibrateSplitAfterOptOut(lastOnly, "last")).toEqual({
        error: "At least one person has to stay in the split.",
      });
    });

    it("flags every contributor whose share rose, and only them", () => {
      const split = tenWayDinner(8);
      const result = recalibrateSplitAfterOptOut(split, "p9");
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      // Both the already-paid and the never-paid contributors get flagged:
      // the label on the public page depends on it, and `paidAmount` alone
      // cannot distinguish a top-up from a genuine partial payment.
      for (let i = 0; i < 9; i += 1) {
        expect(result.participants[i].shareRaised).toBe(true);
      }
      // The person who dropped out did not have their share raised.
      expect(result.participants[9].shareRaised).toBeUndefined();
    });

    it("keeps the flag set across a second drop-out", () => {
      const split = tenWayDinner(8);
      const first = recalibrateSplitAfterOptOut(split, "p8");
      expect("error" in first).toBe(false);
      if ("error" in first) return;
      const second = recalibrateSplitAfterOptOut(
        { ...split, participants: first.participants },
        "p9"
      );
      expect("error" in second).toBe(false);
      if ("error" in second) return;
      for (let i = 0; i < 8; i += 1) {
        expect(second.participants[i].shareRaised).toBe(true);
      }
    });

    it("flags a rescaled custom split too", () => {
      const split: Split = {
        id: "s-custom-flag",
        title: "Custom",
        totalAmount: 1000,
        splitType: "custom",
        createdBy: "me",
        createdAt: 1,
        settled: false,
        participantIds: [],
        participants: [
          { key: "you", name: "You", amount: 400, paid: true, paidAmount: 400, isCurrentUser: true },
          { key: "a", name: "A", amount: 350, paid: false, paidAmount: 0, isCurrentUser: false },
          { key: "b", name: "B", amount: 250, paid: false, paidAmount: 0, isCurrentUser: false },
        ],
      };
      const result = recalibrateSplitAfterOptOut(split, "b");
      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.participants[0].shareRaised).toBe(true);
      expect(result.participants[1].shareRaised).toBe(true);
      expect(result.participants[2].shareRaised).toBeUndefined();
    });

    it("leaves the flag off when a share does not rise", () => {
      // Dropping someone whose share was already 0 redistributes nothing.
      const split: Split = {
        ...tenWayDinner(0),
        totalAmount: 100,
        participants: [
          { key: "you", name: "You", amount: 100, paid: false, paidAmount: 0, isCurrentUser: true },
          { key: "zero", name: "Zero", amount: 0, paid: false, paidAmount: 0, isCurrentUser: false },
        ],
      };
      const result = recalibrateSplitAfterOptOut(split, "zero");
      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.participants[0].amount).toBe(100);
      expect(result.participants[0].shareRaised).toBeUndefined();
    });

    it("₹100 among 5, 4 already paid, 5th drops: remaining 4 each owe ₹5 extra", () => {
      const split: Split = {
        id: "s-100-5",
        title: "Dinner",
        totalAmount: 100,
        splitType: "equal",
        createdBy: "me",
        createdAt: 1,
        settled: false,
        participantIds: [],
        participants: [
          { key: "you", name: "You", amount: 20, paid: true, paidAmount: 20, isCurrentUser: true },
          { key: "a", name: "A", amount: 20, paid: true, paidAmount: 20, isCurrentUser: false },
          { key: "b", name: "B", amount: 20, paid: true, paidAmount: 20, isCurrentUser: false },
          { key: "c", name: "C", amount: 20, paid: true, paidAmount: 20, isCurrentUser: false },
          { key: "d", name: "D", amount: 20, paid: false, paidAmount: 0, isCurrentUser: false },
        ],
      };
      const result = recalibrateSplitAfterOptOut(split, "d");
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      const contributing = result.participants.filter((p) => p.contributing !== false);
      expect(contributing).toHaveLength(4);
      expect(contributing.reduce((sum, p) => sum + p.amount, 0)).toBeCloseTo(100, 2);
      for (const p of contributing) {
        expect(p.amount).toBe(25);
        expect(participantPaidAmount(p)).toBe(20);
        expect(participantRemainingDue(p)).toBe(5);
        expect(p.paid).toBe(false);
        expect(p.shareRaised).toBe(true);
      }
      expect(result.participants[4].contributing).toBe(false);
      expect(result.participants[4].amount).toBe(0);
      expect(result.settled).toBe(false);
    });

    it("blocks opt-out after a collect pot is spent", () => {
      const split = tenWayDinner(8);
      split.kind = "collect";
      split.status = "spent";
      expect(recalibrateSplitAfterOptOut(split, "p9")).toEqual({
        error: "This pot has already been spent.",
      });
    });
  });

  describe("recalibrateSplitAfterAmountChange", () => {
    function fiveWayDinner(): Split {
      return {
        id: "s-edit",
        title: "Dinner",
        totalAmount: 100,
        splitType: "equal",
        createdBy: "me",
        createdAt: 1,
        settled: false,
        participantIds: [],
        participants: [
          { key: "you", name: "You", amount: 20, paid: true, paidAmount: 20, isCurrentUser: true },
          { key: "a", name: "A", amount: 20, paid: true, paidAmount: 20, isCurrentUser: false },
          { key: "b", name: "B", amount: 20, paid: true, paidAmount: 20, isCurrentUser: false },
          { key: "c", name: "C", amount: 20, paid: true, paidAmount: 20, isCurrentUser: false },
          { key: "d", name: "D", amount: 20, paid: false, paidAmount: 0, isCurrentUser: false },
        ],
      };
    }

    it("raises the total and only the extra is still due for people who already paid", () => {
      const result = recalibrateSplitAfterAmountChange(fiveWayDinner(), 125);
      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.totalAmount).toBe(125);
      for (const p of result.participants) {
        expect(p.amount).toBe(25);
      }
      expect(participantPaidAmount(result.participants[0])).toBe(20);
      expect(participantRemainingDue(result.participants[0])).toBe(5);
      expect(participantRemainingDue(result.participants[4])).toBe(25);
    });

    it("lowers the total without wiping money already marked paid", () => {
      const result = recalibrateSplitAfterAmountChange(fiveWayDinner(), 80);
      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.totalAmount).toBe(80);
      for (const p of result.participants) {
        expect(p.amount).toBe(16);
      }
      expect(participantPaidAmount(result.participants[0])).toBe(20);
      expect(participantRemainingDue(result.participants[0])).toBe(0);
      expect(result.participants[0].paid).toBe(true);
      expect(participantRemainingDue(result.participants[4])).toBe(16);
    });

    it("blocks a spent collect pot and a no-op amount", () => {
      const spent = fiveWayDinner();
      spent.kind = "collect";
      spent.status = "spent";
      expect(recalibrateSplitAfterAmountChange(spent, 140)).toEqual({
        error: "This pot has already been spent.",
      });
      expect(recalibrateSplitAfterAmountChange(fiveWayDinner(), 100)).toEqual({
        error: "The amount is already that value.",
      });
    });
  });

  describe("recalibrateSplitAfterAddParticipant", () => {
    function giftPot(paidFriend: boolean): Split {
      return {
        id: "s-gift",
        title: "Wedding gift",
        totalAmount: 1000,
        splitType: "equal",
        kind: "collect",
        status: "collecting",
        createdBy: "me",
        createdAt: 1,
        settled: false,
        participantIds: [],
        participants: [
          {
            key: "you",
            name: "You",
            amount: 500,
            paid: true,
            paidAmount: 500,
            isCurrentUser: true,
          },
          {
            key: "alice",
            name: "Alice",
            amount: 500,
            paid: paidFriend,
            paidAmount: paidFriend ? 500 : 0,
            isCurrentUser: false,
          },
        ],
      };
    }

    it("splits a ₹1000 gift among 3 after adding a friend", () => {
      const result = recalibrateSplitAfterAddParticipant(giftPot(false), {
        name: "Bob",
      });
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      const contributing = result.participants.filter(
        (p) => p.contributing !== false
      );
      expect(contributing).toHaveLength(3);
      expect(contributing.reduce((sum, p) => p.amount + sum, 0)).toBeCloseTo(
        1000,
        2
      );
      expect(result.participants[2].name).toBe("Bob");
      expect(result.participants[2].isCurrentUser).toBe(false);
      expect(result.participants[2].paid).toBe(false);
      expect(participantPaidAmount(result.participants[2])).toBe(0);
      expect(result.participants[2].shareRaised).toBeUndefined();
      expect(result.settled).toBe(false);
      for (const p of contributing) {
        expect(p.amount).toBeCloseTo(333.33, 1);
      }
    });

    it("keeps money already collected and clears a raised-share flag", () => {
      const split = giftPot(true);
      split.participants[0].shareRaised = true;
      split.participants[1].shareRaised = true;
      const result = recalibrateSplitAfterAddParticipant(split, { name: "Bob" });
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      expect(participantPaidAmount(result.participants[0])).toBe(500);
      expect(participantRemainingDue(result.participants[0])).toBe(0);
      expect(result.participants[0].paid).toBe(true);
      expect(result.participants[0].shareRaised).toBeUndefined();
      expect(participantPaidAmount(result.participants[1])).toBe(500);
      expect(participantRemainingDue(result.participants[1])).toBe(0);
      expect(result.participants[2].name).toBe("Bob");
      expect(participantRemainingDue(result.participants[2])).toBeCloseTo(
        result.participants[2].amount,
        2
      );
    });

    it("rescales custom amounts so everyone still sums to the total", () => {
      const split: Split = {
        id: "s-custom-add",
        title: "Custom gift",
        totalAmount: 1000,
        splitType: "custom",
        kind: "collect",
        status: "collecting",
        createdBy: "me",
        createdAt: 1,
        settled: false,
        participantIds: [],
        participants: [
          {
            key: "you",
            name: "You",
            amount: 400,
            paid: true,
            paidAmount: 400,
            isCurrentUser: true,
          },
          {
            key: "a",
            name: "A",
            amount: 350,
            paid: false,
            paidAmount: 0,
            isCurrentUser: false,
          },
          {
            key: "b",
            name: "B",
            amount: 250,
            paid: false,
            paidAmount: 0,
            isCurrentUser: false,
          },
        ],
      };
      const result = recalibrateSplitAfterAddParticipant(split, { name: "C" });
      expect("error" in result).toBe(false);
      if ("error" in result) return;
      const contributing = result.participants.filter(
        (p) => p.contributing !== false
      );
      expect(contributing).toHaveLength(4);
      expect(contributing.reduce((sum, p) => p.amount + sum, 0)).toBeCloseTo(
        1000,
        2
      );
      expect(result.participants[3].name).toBe("C");
      expect(result.participants[3].amount).toBeGreaterThan(0);
      expect(result.participants[0].amount).toBeLessThan(400);
    });

    it("blocks spent pots, empty names, and people already in", () => {
      const spent = giftPot(false);
      spent.status = "spent";
      expect(recalibrateSplitAfterAddParticipant(spent, { name: "Bob" })).toEqual(
        { error: "This pot has already been spent." }
      );
      expect(
        recalibrateSplitAfterAddParticipant(giftPot(false), { name: "   " })
      ).toEqual({ error: "Enter a name." });
      expect(
        recalibrateSplitAfterAddParticipant(giftPot(false), { name: "alice" })
      ).toEqual({ error: "That person is already in this split." });
    });

    it("lets you add back someone who dropped out under the same name", () => {
      const split = giftPot(false);
      split.participants[1].contributing = false;
      split.participants[1].amount = 0;
      const result = recalibrateSplitAfterAddParticipant(split, { name: "Alice" });
      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.participants).toHaveLength(3);
      expect(result.participants[1].contributing).toBe(false);
      expect(result.participants[2].name).toBe("Alice");
      expect(result.participants[2].contributing).not.toBe(false);
    });
  });
});
