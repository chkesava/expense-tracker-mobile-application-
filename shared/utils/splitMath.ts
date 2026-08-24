import type { Participant, Split, SplitKind } from "@/shared/types/split";
import { generatePaymentSlug } from "./paymentSlug";
import { generateUpiLink } from "./upi";

export const BILL_DEFAULT_CATEGORY = "Food";
export const COLLECT_DEFAULT_CATEGORY = "Family";

export function createParticipantKey(): string {
  try {
    return `p_${generatePaymentSlug(10)}`;
  } catch {
    return `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
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

export function isParticipantContributing(p: Participant): boolean {
  return p.contributing !== false;
}

/** Money already marked paid/collected. Legacy docs with only `paid` count as the full share. */
export function participantPaidAmount(p: Participant): number {
  if (typeof p.paidAmount === "number" && Number.isFinite(p.paidAmount)) {
    return roundMoney(Math.max(0, p.paidAmount));
  }
  return p.paid ? roundMoney(Number(p.amount) || 0) : 0;
}

export function participantRemainingDue(p: Participant): number {
  if (!isParticipantContributing(p)) return 0;
  return roundMoney(Math.max(0, (Number(p.amount) || 0) - participantPaidAmount(p)));
}

export function isParticipantShareSettled(p: Participant): boolean {
  return participantRemainingDue(p) <= 0.009;
}

/**
 * Equal share amounts for `count` people, remainder cents on the first share.
 */
export function equalShareAmounts(totalAmount: number, count: number): number[] {
  if (count <= 0 || totalAmount <= 0) return [];
  const baseShare = Math.floor((totalAmount / count) * 100) / 100;
  const remainder = Math.round((totalAmount - baseShare * count) * 100) / 100;
  return Array.from({ length: count }, (_, index) =>
    index === 0 ? roundMoney(baseShare + remainder) : baseShare
  );
}

function rescaleAmountsToTotal(amounts: number[], totalAmount: number): number[] {
  if (amounts.length === 0) return [];
  const sum = amounts.reduce((acc, n) => acc + n, 0);
  if (sum <= 0) return equalShareAmounts(totalAmount, amounts.length);
  const scaled = amounts.map((n) => Math.floor((n / sum) * totalAmount * 100) / 100);
  const remainder = roundMoney(totalAmount - scaled.reduce((acc, n) => acc + n, 0));
  scaled[0] = roundMoney(scaled[0] + remainder);
  return scaled;
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

  const shares = equalShareAmounts(totalAmount, participants.length);

  return participants.map((p, index) => {
    const amount = shares[index];
    const participant: Participant = {
      key: p.key || createParticipantKey(),
      name: p.name,
      amount,
      paid: p.isCurrentUser,
      paidAmount: p.isCurrentUser ? amount : 0,
      contributing: true,
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
 * Uses `paidAmount` so a top-up after someone drops out is not treated as fully settled.
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
    settledAmount += participantPaidAmount(p);
    if (isParticipantContributing(p) && !isParticipantShareSettled(p)) {
      unpaidCount++;
    }
  }

  const roundedSettled = Math.min(total, Math.round(settledAmount * 100) / 100);
  const percentage = Math.min(100, Math.max(0, Math.round((roundedSettled / total) * 100)));
  const isFullySettled = isCollectSpent(split) || unpaidCount === 0;

  return {
    settledAmount: roundedSettled,
    totalAmount: total,
    percentage,
    isFullySettled,
    unpaidCount,
  };
}

export function othersFullyCollected(split: Split): boolean {
  const others = (split.participants || []).filter(
    (p) => !p.isCurrentUser && isParticipantContributing(p)
  );
  return others.length > 0 && others.every((p) => isParticipantShareSettled(p));
}

export function collectedFromOthers(split: Split): number {
  return roundMoney(
    (split.participants || [])
      .filter((p) => !p.isCurrentUser)
      .reduce((sum, p) => sum + participantPaidAmount(p), 0)
  );
}

export function uniqueCollectedAccountIds(split: Split): string[] {
  const ids: string[] = [];
  for (const p of split.participants || []) {
    if (!p.isCurrentUser && participantPaidAmount(p) > 0 && p.receivedAccountId) {
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
        if (!p.isCurrentUser) {
          totalOwedToYou += participantRemainingDue(p);
        }
      }
    } else {
      for (const p of split.participants || []) {
        if (p.isCurrentUser || p.userId === currentUserId) {
          totalYouOwe += participantRemainingDue(p);
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

function moneyLabel(currency: string, value: number): string {
  return `${currency} ${value.toFixed(2)}`;
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
  const due = participantRemainingDue(participant);
  const paid = participantPaidAmount(participant);
  const share = Number(participant.amount) || 0;
  const upiLink = creatorUpiId
    ? generateUpiLink(
        creatorUpiId,
        payeeName,
        due,
        `Split: ${split.title}`
      )
    : "";

  let message = `Hi ${participant.name},\n\nHere is the reminder for "${split.title}":`;
  if (paid > 0.009 && due > 0.009) {
    message += `\nShare: ${moneyLabel(currency, share)}\nPaid: ${moneyLabel(currency, paid)}\nAmount still due: ${moneyLabel(currency, due)}`;
  } else {
    message += `\nAmount Due: ${moneyLabel(currency, due > 0.009 ? due : share)}`;
  }

  if (upiLink) {
    message += `\n\nPay via UPI:\n${upiLink}`;
  }

  if (shareUrl) {
    message += `\n\nOr open payment page:\n${shareUrl}`;
  }

  return message;
}

/** Group link + who still owes. */
export function generateSplitGroupShareMessage(
  split: Split,
  currency = "INR",
  shareUrl?: string
): string {
  const owing = (split.participants || []).filter(
    (p) => isParticipantContributing(p) && participantRemainingDue(p) > 0.009
  );
  let message = `"${split.title}" · ${moneyLabel(currency, split.totalAmount || 0)}`;
  if (owing.length > 0) {
    message += "\n\nStill due:";
    for (const p of owing) {
      message += `\n• ${p.name}: ${moneyLabel(currency, participantRemainingDue(p))}`;
    }
  } else {
    message += "\n\nEveryone is settled.";
  }
  if (shareUrl) {
    message += `\n\nDetails:\n${shareUrl}`;
  }
  return message;
}

export function findParticipantIndex(
  split: Split,
  participantKey: string
): number {
  return (split.participants || []).findIndex((p) => p.key === participantKey);
}

export function optOutBlockedReason(
  split: Split,
  participantKey: string
): string | null {
  if (isCollectSpent(split)) {
    return "This pot has already been spent.";
  }
  const index = findParticipantIndex(split, participantKey);
  if (index < 0) return "Participant not found.";
  const target = split.participants[index];
  if (target.isCurrentUser) {
    return "You can't drop yourself from a split you organized.";
  }
  if (!isParticipantContributing(target)) {
    return "This person is already marked as not contributing.";
  }
  const remaining = (split.participants || []).filter(
    (p, i) => i !== index && isParticipantContributing(p)
  );
  if (remaining.length < 1) {
    return "At least one person has to stay in the split.";
  }
  return null;
}

function redistributeContributingShares(
  participants: Participant[],
  totalAmount: number,
  splitType: Split["splitType"]
): Participant[] {
  const next = participants.map((p) => ({ ...p }));
  const contributorIndexes = next
    .map((p, i) => (isParticipantContributing(p) ? i : -1))
    .filter((i) => i >= 0);

  const newAmounts =
    splitType === "custom"
      ? rescaleAmountsToTotal(
          contributorIndexes.map((i) => Number(next[i].amount) || 0),
          totalAmount
        )
      : equalShareAmounts(totalAmount, contributorIndexes.length);

  contributorIndexes.forEach((participantIndex, n) => {
    const p = next[participantIndex];
    const amount = newAmounts[n];
    const paidAmount = participantPaidAmount(p);
    const due = roundMoney(Math.max(0, amount - paidAmount));
    const previousAmount = Number(p.amount) || 0;
    // Set when a share goes up (dropout / higher total). Clear when it goes
    // down (someone joins / lower total). A brand-new row starts at 0, so
    // that rise is not a top-up.
    const shareRaised =
      amount > previousAmount && previousAmount > 0
        ? true
        : amount < previousAmount
          ? undefined
          : p.shareRaised;
    next[participantIndex] = {
      ...p,
      amount,
      paid: due <= 0.009,
    };
    if (shareRaised) {
      next[participantIndex].shareRaised = true;
    } else {
      delete next[participantIndex].shareRaised;
    }
  });
  return next;
}

/**
 * Mark someone as not contributing and redistribute the total among people who still are.
 * Equal: new equal shares. Custom: rescale remaining amounts so they still sum to the total.
 * Keeps `paidAmount`; anyone who already paid may owe a top-up.
 */
export function recalibrateSplitAfterOptOut(
  split: Split,
  participantKey: string
):
  | { participants: Participant[]; settled: boolean }
  | { error: string } {
  const blocked = optOutBlockedReason(split, participantKey);
  if (blocked) return { error: blocked };

  const index = findParticipantIndex(split, participantKey);
  const next = split.participants.map((p, i) => {
    if (i !== index) return { ...p };
    return {
      ...p,
      contributing: false,
      amount: 0,
      paid: true,
    };
  });

  const participants = redistributeContributingShares(
    next,
    split.totalAmount,
    split.splitType
  );

  return {
    participants,
    settled: participants.every((p) => isParticipantShareSettled(p)),
  };
}

export function amountChangeBlockedReason(
  split: Split,
  newTotal: number
): string | null {
  if (isCollectSpent(split)) {
    return "This pot has already been spent.";
  }
  if (!(newTotal > 0) || !Number.isFinite(newTotal)) {
    return "Enter an amount greater than zero.";
  }
  if (Math.abs(roundMoney(newTotal) - roundMoney(split.totalAmount || 0)) < 0.01) {
    return "The amount is already that value.";
  }
  const remaining = (split.participants || []).filter(isParticipantContributing);
  if (remaining.length < 1) {
    return "At least one person has to stay in the split.";
  }
  return null;
}

/**
 * Change the split total and redistribute among people who are still in.
 * Equal: new equal shares. Custom: rescale remaining amounts so they still sum to the new total.
 * Keeps `paidAmount`; anyone who already paid may owe a top-up (or be overpaid).
 */
export function recalibrateSplitAfterAmountChange(
  split: Split,
  newTotal: number
):
  | { participants: Participant[]; settled: boolean; totalAmount: number }
  | { error: string } {
  const totalAmount = roundMoney(newTotal);
  const blocked = amountChangeBlockedReason(split, totalAmount);
  if (blocked) return { error: blocked };

  const participants = redistributeContributingShares(
    split.participants,
    totalAmount,
    split.splitType
  );

  return {
    participants,
    totalAmount,
    settled: participants.every((p) => isParticipantShareSettled(p)),
  };
}

export function addParticipantBlockedReason(
  split: Split,
  name: string
): string | null {
  if (isCollectSpent(split)) {
    return "This pot has already been spent.";
  }
  const trimmed = name.trim();
  if (!trimmed) return "Enter a name.";
  const alreadyIn = (split.participants || []).some(
    (p) =>
      isParticipantContributing(p) &&
      p.name.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (alreadyIn) {
    return "That person is already in this split.";
  }
  const remaining = (split.participants || []).filter(isParticipantContributing);
  if (remaining.length < 1) {
    return "At least one person has to stay in the split.";
  }
  return null;
}

/**
 * Add a contributing person and redistribute the same total among everyone still in.
 * Equal: new equal shares. Custom: seed the new row with an equal slice, then
 * rescale remaining amounts so they still sum to the total.
 * Keeps `paidAmount`; people who already paid keep that credit (they may now
 * owe nothing extra).
 */
export function recalibrateSplitAfterAddParticipant(
  split: Split,
  input: { name: string; upiId?: string }
):
  | { participants: Participant[]; settled: boolean }
  | { error: string } {
  const name = input.name.trim();
  const blocked = addParticipantBlockedReason(split, name);
  if (blocked) return { error: blocked };

  const contributingCount =
    (split.participants || []).filter(isParticipantContributing).length + 1;
  const seedAmounts = equalShareAmounts(split.totalAmount, contributingCount);
  const seed = seedAmounts[seedAmounts.length - 1] ?? 0;
  const upiId = input.upiId?.trim();

  const added: Participant = {
    key: createParticipantKey(),
    name,
    amount: seed,
    paid: false,
    paidAmount: 0,
    contributing: true,
    isCurrentUser: false,
  };
  if (upiId) added.upiId = upiId;

  const participants = redistributeContributingShares(
    [...split.participants.map((p) => ({ ...p })), added],
    split.totalAmount,
    split.splitType
  );

  return {
    participants,
    settled: participants.every((p) => isParticipantShareSettled(p)),
  };
}

export function publicSplitStatus(
  split: Pick<Split, "kind" | "status" | "settled">,
  settled: boolean
): string {
  if (isCollectSplit(split) && split.status === "spent") return "spent";
  if (settled || split.settled) return "settled";
  if (isCollectSplit(split)) return "collecting";
  return "open";
}
