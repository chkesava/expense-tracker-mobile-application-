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
  return omitUndefined({
    key: p.key || createParticipantKey(),
    name: p.name,
    amount: Number(p.amount) || 0,
    paid: Boolean(p.paid),
    isCurrentUser: Boolean(p.isCurrentUser),
    upiId: p.upiId || undefined,
    userId: p.userId || undefined,
    photoURL: p.photoURL || undefined,
    receivedAccountId: p.receivedAccountId || undefined,
    collectedEntryId: p.collectedEntryId || undefined,
    paymentSlug: p.paymentSlug || undefined,
    paymentRequestId: p.paymentRequestId || undefined,
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

export function buildCollectShareRequests(params: {
  splitId: string;
  splitTitle: string;
  createdBy: string;
  createdAt: number;
  payeeName: string;
  payeePhotoUrl?: string;
  upiId: string;
  qrStyleId: QrStyleId;
  participants: Participant[];
}): Array<{
  participantKey: string;
  slug: string;
  payload: Omit<PaymentRequest, "id">;
}> {
  if (!params.upiId) return [];

  return params.participants
    .filter((p) => !p.isCurrentUser && p.key)
    .map((p) => {
      const slug = generatePaymentSlug(10);
      const key = p.key as string;
      return {
        participantKey: key,
        slug,
        payload: omitUndefined({
          slug,
          createdBy: params.createdBy,
          createdAt: params.createdAt,
          amount: Number(p.amount) || 0,
          note: params.splitTitle,
          notePrefix: "Split",
          payeeName: params.payeeName,
          payeePhotoUrl: params.payeePhotoUrl || undefined,
          upiId: params.upiId,
          qrStyleId: params.qrStyleId,
          status: "active" as const,
          splitId: params.splitId,
          participantKey: key,
        }) as Omit<PaymentRequest, "id">,
      };
    });
}

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
  if (target.paid && target.collectedEntryId) {
    return { error: "Already marked collected." };
  }
  if (!params.accountId) return { error: "Choose the account that received the money." };

  const participants = params.split.participants.map((p, idx) => {
    if (idx !== index) return p;
    return {
      ...p,
      paid: true,
      receivedAccountId: params.accountId,
      collectedEntryId: params.entryId,
    };
  });
  const settled = participants.every((p) => p.paid);

  const entry = omitUndefined({
    accountId: params.accountId,
    amount: Number(target.amount) || 0,
    direction: "credit" as const,
    date: params.dateKey,
    note: `Collected from ${target.name} — ${params.split.title}`,
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

  const participants = params.split.participants.map((p, idx) => {
    if (idx !== index) return p;
    const next: Participant = {
      ...p,
      paid: false,
    };
    delete next.receivedAccountId;
    delete next.collectedEntryId;
    return next;
  });

  return {
    participants,
    settled: participants.every((p) => p.paid),
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
} {
  const entryIds = (split.participants || [])
    .map((p) => p.collectedEntryId)
    .filter((id): id is string => Boolean(id));
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
  };
}
