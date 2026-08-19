import type { Participant, Split, SplitKind } from "@/shared/types/split";
import { generatePaymentSlug } from "./paymentSlug";
import { generateUpiLink } from "./upi";

export const BILL_DEFAULT_CATEGORY = "Food & Dining";
export const COLLECT_DEFAULT_CATEGORY = "Gifts & Donations";

export function createParticipantKey(): string {
  return `p_${generatePaymentSlug(10)}`;
}

export function getSplitKind(split: Pick<Split, "kind">): SplitKind {
  return split.kind === "collect" ? "collect" : "bill";
}

export function isCollectSplit(split: Pick<Split, "kind">): boolean {
  return getSplitKind(split) === "collect";
}

export function isCollectSpent(split: Split): boolean {
  return isCollectSplit(split) && split.status === "spent";
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates equal share amounts for a list of participants, allocating fractional cents cleanly.
 */
export function calculateEqualSplits(
  totalAmount: number,
  participants: Array<{
    name: string;
    isCurrentUser: boolean;
    key?: string;
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
    const amount = index === 0 ? Number((baseShare + remainder).toFixed(2)) : baseShare;
    const participant: Participant = {
      key: p.key || createParticipantKey(),
      name: p.name,
      amount,
      paid: p.isCurrentUser,
      isCurrentUser: p.isCurrentUser,
    };
    if (p.upiId) participant.upiId = p.upiId;
    if (p.userId) participant.userId = p.userId;
    if (p.photoURL) participant.photoURL = p.photoURL;
    return participant;
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
  const isFullySettled =
    isCollectSpent(split) || unpaidCount === 0 || roundedSettled >= total;

  return {
    settledAmount: roundedSettled,
    totalAmount: total,
    percentage,
    isFullySettled,
    unpaidCount,
  };
}

export function othersFullyCollected(split: Split): boolean {
  const others = (split.participants || []).filter((p) => !p.isCurrentUser);
  return others.length > 0 && others.every((p) => p.paid);
}

export function collectedFromOthers(split: Split): number {
  return roundMoney(
    (split.participants || [])
      .filter((p) => !p.isCurrentUser && p.paid)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  );
}

export function uniqueCollectedAccountIds(split: Split): string[] {
  const ids: string[] = [];
  for (const p of split.participants || []) {
    if (!p.isCurrentUser && p.paid && p.receivedAccountId) {
      if (!ids.includes(p.receivedAccountId)) ids.push(p.receivedAccountId);
    }
  }
  return ids;
}

export function computeCollectSpendBreakdown(
  split: Split,
  spendAmount: number
): {
  othersCollected: number;
  passThroughDebit: number;
  ownExpense: number;
} {
  const othersCollected = collectedFromOthers(split);
  const spend = roundMoney(Math.max(0, spendAmount));
  const passThroughDebit = roundMoney(Math.min(othersCollected, spend));
  const ownExpense = roundMoney(Math.max(0, spend - passThroughDebit));
  return { othersCollected, passThroughDebit, ownExpense };
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
    const closed = split.settled || progress.isFullySettled || isCollectSpent(split);

    if (closed) {
      settledCount++;
    } else {
      activeCount++;
    }

    if (closed) continue;

    if (isCreator) {
      for (const p of split.participants || []) {
        if (!p.isCurrentUser && !p.paid) {
          totalOwedToYou += Number(p.amount) || 0;
        }
      }
    } else {
      for (const p of split.participants || []) {
        if (
          (p.isCurrentUser || p.userId === currentUserId) &&
          !p.paid
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
  currency = "INR",
  shareUrl?: string
): string {
  const payeeName = split.createdByName || "Split Organizer";
  const upiLink = creatorUpiId
    ? generateUpiLink(
        creatorUpiId,
        payeeName,
        participant.amount,
        `Split: ${split.title}`
      )
    : "";

  let message = `Hi ${participant.name},\n\nHere is the reminder for "${split.title}":\nAmount Due: ${currency} ${participant.amount.toFixed(2)}`;

  if (upiLink) {
    message += `\n\nPay via UPI:\n${upiLink}`;
  }

  if (shareUrl) {
    message += `\n\nOr open payment page:\n${shareUrl}`;
  }

  return message;
}

export function findParticipantIndex(
  split: Split,
  participantKey: string
): number {
  return (split.participants || []).findIndex((p) => p.key === participantKey);
}
