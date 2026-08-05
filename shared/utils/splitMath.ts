import type { Participant, Split } from "@/shared/types/split";
import { generateUpiLink } from "./upi";

/**
 * Calculates equal share amounts for a list of participants, allocating fractional cents cleanly.
 */
export function calculateEqualSplits(
  totalAmount: number,
  participants: Array<{
    name: string;
    isCurrentUser: boolean;
    upiId?: string;
    userId?: string;
    photoURL?: string;
  }>
): Participant[] {
  if (participants.length === 0 || totalAmount <= 0) return [];

  const count = participants.length;
  const baseShare = Math.floor((totalAmount / count) * 100) / 100;
  const remainder = Math.round((totalAmount - baseShare * count) * 100) / 100;

  return participants.map((p, index) => {
    // Allocate the penny/cent remainder to the first participant (usually the payer)
    const amount = index === 0 ? Number((baseShare + remainder).toFixed(2)) : baseShare;
    return {
      name: p.name,
      amount,
      paid: p.isCurrentUser, // Creator/payer starts marked as paid
      upiId: p.upiId || "",
      isCurrentUser: p.isCurrentUser,
      userId: p.userId,
      photoURL: p.photoURL,
    };
  });
}

/**
 * Validates that custom participant amounts equal the total split amount.
 */
export function validateCustomSplits(
  totalAmount: number,
  participants: Participant[]
): { isValid: boolean; difference: number } {
  const sum = participants.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  const diff = Math.round((totalAmount - sum) * 100) / 100;
  return {
    isValid: Math.abs(diff) < 0.01,
    difference: diff,
  };
}

/**
 * Computes settlement progress for a single split.
 */
export function computeSplitProgress(split: Split): {
  settledAmount: number;
  totalAmount: number;
  percentage: number;
  isFullySettled: boolean;
  unpaidCount: number;
} {
  const total = split.totalAmount || 0;
  if (total <= 0) {
    return { settledAmount: 0, totalAmount: 0, percentage: 100, isFullySettled: true, unpaidCount: 0 };
  }

  let settledAmount = 0;
  let unpaidCount = 0;

  for (const p of split.participants || []) {
    if (p.paid) {
      settledAmount += Number(p.amount) || 0;
    } else {
      unpaidCount++;
    }
  }

  const roundedSettled = Math.min(total, Math.round(settledAmount * 100) / 100);
  const percentage = Math.min(100, Math.max(0, Math.round((roundedSettled / total) * 100)));
  const isFullySettled = unpaidCount === 0 || roundedSettled >= total;

  return {
    settledAmount: roundedSettled,
    totalAmount: total,
    percentage,
    isFullySettled,
    unpaidCount,
  };
}

export interface SplitsAggregateSummary {
  totalOwedToYou: number;
  totalYouOwe: number;
  activeCount: number;
  settledCount: number;
}

/**
 * Aggregates debt balances across all splits for the current user.
 */
export function computeSplitSummary(
  splits: Split[],
  currentUserId: string
): SplitsAggregateSummary {
  let totalOwedToYou = 0;
  let totalYouOwe = 0;
  let activeCount = 0;
  let settledCount = 0;

  for (const split of splits) {
    const isCreator = split.createdBy === currentUserId;
    const progress = computeSplitProgress(split);

    if (split.settled || progress.isFullySettled) {
      settledCount++;
    } else {
      activeCount++;
    }

    if (isCreator) {
      // Creator paid: others owe creator their unpaid portions
      for (const p of split.participants || []) {
        if (!p.isCurrentUser && !p.paid && (!split.settled)) {
          totalOwedToYou += Number(p.amount) || 0;
        }
      }
    } else {
      // Someone else created: check if current user owes anything
      for (const p of split.participants || []) {
        if (
          (p.isCurrentUser || p.userId === currentUserId) &&
          !p.paid &&
          !split.settled
        ) {
          totalYouOwe += Number(p.amount) || 0;
        }
      }
    }
  }

  return {
    totalOwedToYou: Math.round(totalOwedToYou * 100) / 100,
    totalYouOwe: Math.round(totalYouOwe * 100) / 100,
    activeCount,
    settledCount,
  };
}

/**
 * Formats a shareable reminder message with UPI deep link.
 */
export function generateSplitShareMessage(
  split: Split,
  participant: Participant,
  creatorUpiId?: string,
  currency = "INR"
): string {
  const upiLink = creatorUpiId
    ? generateUpiLink(creatorUpiId, split.createdByName || "Split Organizer", participant.amount, `Split: ${split.title}`)
    : "";

  let message = `Hi ${participant.name},\n\nHere is the reminder for "${split.title}":\nAmount Due: ${currency} ${participant.amount.toFixed(2)}`;

  if (upiLink) {
    message += `\n\nPay via UPI:\n${upiLink}`;
  }

  return message;
}
