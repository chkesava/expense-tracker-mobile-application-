import type { QrStyleId } from "@/shared/utils/qrStyles";
import type { PaymentRequest } from "@/shared/types/paymentRequest";
import type { Participant, Split } from "@/shared/types/split";
import { omitUndefined } from "./firestorePayload";
import { generatePaymentSlug } from "./paymentSlug";
import {
  BILL_DEFAULT_CATEGORY,
  COLLECT_DEFAULT_CATEGORY,
  computeCollectSpendBreakdown,
  createParticipantKey,
  findParticipantIndex,
  getSplitKind,
  isCollectSpent,
  isCollectSplit,
  isParticipantContributing,
  isParticipantShareSettled,
  participantPaidAmount,
  participantRemainingDue,
} from "./splitMath";

export type CreateSplitInput = Omit<
  Split,
  "id" | "createdAt" | "createdBy" | "participantIds" | "settled"
>;

export function withParticipantKeys(participants: Participant[]): Participant[] {
  return participants.map((p) => ({
    ...p,
    key: p.key || createParticipantKey(),
  }));
}

export function toFirestoreParticipant(p: Participant): Record<string, unknown> {
  const amount = Number(p.amount) || 0;
  const paidAmount =
    typeof p.paidAmount === "number" && Number.isFinite(p.paidAmount)
      ? Number(p.paidAmount)
      : p.paid
        ? amount
        : 0;
  return omitUndefined({
    key: p.key || createParticipantKey(),
    name: p.name,
    amount,
    paid: Boolean(p.paid),
    paidAmount,
    contributing: p.contributing !== false,
    isCurrentUser: Boolean(p.isCurrentUser),
    upiId: p.upiId || undefined,
    userId: p.userId || undefined,
    photoURL: p.photoURL || undefined,
    receivedAccountId: p.receivedAccountId || undefined,
    collectedEntryId: p.collectedEntryId || undefined,
    collectedEntryIds: p.collectedEntryIds?.length ? p.collectedEntryIds : undefined,
    paymentSlug: p.paymentSlug || undefined,
    paymentRequestId: p.paymentRequestId || undefined,
    shareRaised: p.shareRaised ? true : undefined,
  });
}

export function buildCreateSplitPayload(params: {
  uid: string;
  createdByName: string;
  createdAt: number;
  data: CreateSplitInput;
  options?: { createPersonalExpense?: boolean; accountId?: string };
  dateKey: string;
  monthKey: string;
  splitId: string;
}): {
  split: Record<string, unknown>;
  expense: Record<string, unknown> | null;
} {
  const kind = getSplitKind(params.data);
  const participants = params.data.participants.map((p) =>
    toFirestoreParticipant(p)
  );

  const participantIds = params.data.participants
    .map((p) => p.userId)
    .filter((id): id is string => Boolean(id));
  if (!participantIds.includes(params.uid)) {
    participantIds.push(params.uid);
  }

  const split = omitUndefined({
    title: params.data.title,
    totalAmount: params.data.totalAmount,
    splitType: params.data.splitType,
    participants,
    createdBy: params.uid,
    createdByName: params.createdByName,
    createdAt: params.createdAt,
    participantIds,
    settled: false,
    kind,
    status: kind === "collect" ? "collecting" : undefined,
    category:
      params.data.category ||
      (kind === "collect" ? COLLECT_DEFAULT_CATEGORY : BILL_DEFAULT_CATEGORY),
    notes: params.data.notes || undefined,
    paymentRequestIds: params.data.paymentRequestIds?.length
      ? params.data.paymentRequestIds
      : undefined,
    publicSlug: params.data.publicSlug || undefined,
    publicShareId: params.data.publicShareId || undefined,
  });

  let expense: Record<string, unknown> | null = null;
  const shouldLogShare =
    kind === "bill" && Boolean(params.options?.createPersonalExpense);
  if (shouldLogShare) {
    const creatorShare =
      params.data.participants.find((p) => p.isCurrentUser)?.amount || 0;
    if (creatorShare > 0) {
      expense = omitUndefined({
        amount: creatorShare,
        category: params.data.category || BILL_DEFAULT_CATEGORY,
        subcategory: "Dining Out",
        note: `[Split Share] ${params.data.title}`,
        date: params.dateKey,
        month: params.monthKey,
        splitId: params.splitId,
        accountId: params.options?.accountId || undefined,
      });
    }
  }

  return { split, expense };
}

export function buildParticipantShareRequests(params: {
  splitId: string;
  splitTitle: string;
  createdBy: string;
  createdAt: number;
  payeeName: string;
  payeePhotoUrl?: string;
  upiId: string;
  qrStyleId: QrStyleId;
  currency?: string;
  /**
   * Back-fill mode: skip participants that already have a request, so this can
   * repair a split whose organizer had no UPI id when it was created without
   * duplicating the links that do exist.
   */
  skipExisting?: boolean;
  participants: Participant[];
}): Array<{
  participantKey: string;
  slug: string;
  payload: Omit<PaymentRequest, "id">;
}> {
  if (!params.upiId) return [];

  return params.participants
    .filter((p) => !p.isCurrentUser && p.key && isParticipantContributing(p))
    .filter((p) => !params.skipExisting || !(p.paymentRequestId || p.paymentSlug))
    .map((p) => {
      const slug = generatePaymentSlug(10);
      const key = p.key as string;
      const shareAmount = Number(p.amount) || 0;
      const paidAmount = participantPaidAmount(p);
      const remaining = participantRemainingDue(p);
      return {
        participantKey: key,
        slug,
        payload: omitUndefined({
          slug,
          createdBy: params.createdBy,
          createdAt: params.createdAt,
          amount: remaining,
          shareAmount,
          paidAmount,
          note: params.splitTitle,
          notePrefix: "Split",
          payeeName: params.payeeName,
          payeePhotoUrl: params.payeePhotoUrl || undefined,
          upiId: params.upiId,
          qrStyleId: params.qrStyleId,
          status: "active" as const,
          splitId: params.splitId,
          participantKey: key,
          currency: params.currency || undefined,
        }) as Omit<PaymentRequest, "id">,
      };
    });
}

/** @deprecated Use buildParticipantShareRequests — kept for existing tests. */
export const buildCollectShareRequests = buildParticipantShareRequests;

export function applyShareRequestsToParticipants(
  participants: Participant[],
  requests: Array<{
    participantKey: string;
    slug: string;
    requestId: string;
  }>
): Participant[] {
  const byKey = new Map(requests.map((r) => [r.participantKey, r]));
  return participants.map((p) => {
    const key = p.key || createParticipantKey();
    const match = byKey.get(key);
    if (!match) return { ...p, key };
    return {
      ...p,
      key,
      paymentSlug: match.slug,
      paymentRequestId: match.requestId,
    };
  });
}

export function buildPaymentRequestSyncPatches(
  participants: Participant[],
  options?: { currency?: string; note?: string }
): Array<{ requestId: string; fields: Record<string, unknown> }> {
  return participants
    .filter((p) => Boolean(p.paymentRequestId))
    .map((p) => {
      const optedOut = !isParticipantContributing(p);
      return {
        requestId: p.paymentRequestId as string,
        fields: omitUndefined({
          amount: participantRemainingDue(p),
          shareAmount: Number(p.amount) || 0,
          paidAmount: participantPaidAmount(p),
          status: optedOut ? ("cancelled" as const) : ("active" as const),
          // The public pay page has no signed-in user, so it cannot read
          // system settings for a currency. Carry it on the doc.
          currency: options?.currency || undefined,
          note: options?.note || undefined,
        }),
      };
    });
}

function collectedEntryIdList(p: Participant): string[] {
  const ids = [...(p.collectedEntryIds || [])];
  if (p.collectedEntryId && !ids.includes(p.collectedEntryId)) {
    ids.push(p.collectedEntryId);
  }
  return ids;
}

export function buildMarkCollectedWrites(params: {
  split: Split;
  participantKey: string;
  accountId: string;
  entryId: string;
  dateKey: string;
}):
  | {
      participants: Participant[];
      settled: boolean;
      entry: Record<string, unknown>;
    }
  | { error: string } {
  if (isCollectSpent(params.split)) {
    return { error: "This pot has already been spent." };
  }
  const index = findParticipantIndex(params.split, params.participantKey);
  if (index < 0) return { error: "Participant not found." };

  const target = params.split.participants[index];
  if (target.isCurrentUser) {
    return { error: "Your own share stays in your account — nothing to collect." };
  }
  if (!isParticipantContributing(target)) {
    return { error: "This person isn't contributing." };
  }
  const due = participantRemainingDue(target);
  if (due <= 0.009) {
    return { error: "Already marked collected." };
  }
  if (!params.accountId) return { error: "Choose the account that received the money." };

  const alreadyPaid = participantPaidAmount(target);
  const nextPaidAmount = alreadyPaid + due;
  const priorIds = collectedEntryIdList(target);
  const collectedEntryIds = [...priorIds, params.entryId];

  const participants = params.split.participants.map((p, idx) => {
    if (idx !== index) return p;
    return {
      ...p,
      paid: true,
      paidAmount: nextPaidAmount,
      receivedAccountId: params.accountId,
      collectedEntryId: params.entryId,
      collectedEntryIds,
    };
  });
  const settled = participants.every((p) => isParticipantShareSettled(p));

  const entry = omitUndefined({
    accountId: params.accountId,
    amount: due,
    direction: "credit" as const,
    date: params.dateKey,
    note:
      alreadyPaid > 0.009
        ? `Top-up from ${target.name} — ${params.split.title}`
        : `Collected from ${target.name} — ${params.split.title}`,
    linkedSplitId: params.split.id,
    source: "split_collection" as const,
  });

  return { participants, settled, entry };
}

export function buildUnmarkCollectedWrites(params: {
  split: Split;
  participantKey: string;
}):
  | {
      participants: Participant[];
      settled: boolean;
      entryIdsToDelete: string[];
      entryIdToDelete?: string;
    }
  | { error: string } {
  if (isCollectSpent(params.split)) {
    return { error: "This pot has already been spent." };
  }
  const index = findParticipantIndex(params.split, params.participantKey);
  if (index < 0) return { error: "Participant not found." };

  const target = params.split.participants[index];
  if (target.isCurrentUser) {
    return { error: "Your pledged share cannot be unmarked." };
  }

  const entryIdsToDelete = collectedEntryIdList(target);

  const participants = params.split.participants.map((p, idx) => {
    if (idx !== index) return p;
    const next: Participant = {
      ...p,
      paid: false,
      paidAmount: 0,
    };
    delete next.receivedAccountId;
    delete next.collectedEntryId;
    delete next.collectedEntryIds;
    return next;
  });

  return {
    participants,
    settled: participants.every((p) => isParticipantShareSettled(p)),
    entryIdsToDelete,
    entryIdToDelete: target.collectedEntryId,
  };
}

export function buildSpendGiftWrites(params: {
  split: Split;
  spendAmount: number;
  payingAccountId: string;
  dateKey: string;
  monthKey: string;
  expenseId: string;
  passThroughEntryId: string;
}):
  | {
      splitUpdates: Record<string, unknown>;
      expense: Record<string, unknown> | null;
      passThroughEntry: Record<string, unknown> | null;
    }
  | { error: string } {
  if (!isCollectSplit(params.split)) {
    return { error: "Only collect pots can be spent as a gift." };
  }
  if (isCollectSpent(params.split)) {
    return { error: "This pot has already been spent." };
  }
  if (!params.payingAccountId) {
    return { error: "Choose the account used to buy the gift." };
  }
  if (!(params.spendAmount > 0)) {
    return { error: "Enter a valid gift amount." };
  }

  const breakdown = computeCollectSpendBreakdown(params.split, params.spendAmount);
  const splitUpdates = omitUndefined({
    status: "spent",
    settled: true,
    spentAccountId: params.payingAccountId,
    spentAmount: breakdown.passThroughDebit + breakdown.ownExpense,
    spentExpenseId: breakdown.ownExpense > 0 ? params.expenseId : undefined,
    spendPassThroughEntryId:
      breakdown.passThroughDebit > 0 ? params.passThroughEntryId : undefined,
  });

  const expense =
    breakdown.ownExpense > 0
      ? omitUndefined({
          amount: breakdown.ownExpense,
          category: params.split.category || COLLECT_DEFAULT_CATEGORY,
          subcategory: "Gift",
          note: `[Gift] ${params.split.title}`,
          date: params.dateKey,
          month: params.monthKey,
          splitId: params.split.id,
          accountId: params.payingAccountId,
        })
      : null;

  const passThroughEntry =
    breakdown.passThroughDebit > 0
      ? omitUndefined({
          accountId: params.payingAccountId,
          amount: breakdown.passThroughDebit,
          direction: "debit" as const,
          date: params.dateKey,
          note: `Gift purchase (friends' share) — ${params.split.title}`,
          linkedSplitId: params.split.id,
          source: "split_spend" as const,
        })
      : null;

  return { splitUpdates, expense, passThroughEntry };
}

export function linkedLedgerIds(split: Split): {
  entryIds: string[];
  expenseIds: string[];
  paymentRequestIds: string[];
  publicShareId?: string;
} {
  const entryIds = (split.participants || []).flatMap((p) => collectedEntryIdList(p));
  if (split.spendPassThroughEntryId) {
    entryIds.push(split.spendPassThroughEntryId);
  }
  const expenseIds = split.spentExpenseId ? [split.spentExpenseId] : [];
  const paymentRequestIds = [
    ...(split.paymentRequestIds || []),
    ...((split.participants || [])
      .map((p) => p.paymentRequestId)
      .filter((id): id is string => Boolean(id))),
  ];
  return {
    entryIds: [...new Set(entryIds)],
    expenseIds,
    paymentRequestIds: [...new Set(paymentRequestIds)],
    publicShareId: split.publicShareId,
  };
}
