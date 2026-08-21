import type { Participant, Split } from "@/shared/types/split";
import type { SplitPublicShareParticipant } from "@/shared/types/splitPublicShare";
import { omitUndefined } from "./firestorePayload";
import {
  getSplitKind,
  isParticipantContributing,
  participantPaidAmount,
  participantRemainingDue,
  publicSplitStatus,
} from "./splitMath";

export function toPublicShareParticipant(
  p: Participant
): SplitPublicShareParticipant {
  const optedOut = !isParticipantContributing(p);
  return omitUndefined({
    name: p.name,
    amount: Number(p.amount) || 0,
    paidAmount: participantPaidAmount(p),
    remainingDue: participantRemainingDue(p),
    optedOut,
    isOrganizer: Boolean(p.isCurrentUser),
    personSlug: p.paymentSlug || undefined,
  }) as SplitPublicShareParticipant;
}

export function buildSplitPublicSharePayload(params: {
  splitId: string;
  slug: string;
  createdBy: string;
  title: string;
  kind?: Split["kind"];
  totalAmount: number;
  organizerName: string;
  settled: boolean;
  status?: Split["status"];
  currency?: string;
  updatedAt: number;
  participants: Participant[];
}): Record<string, unknown> {
  return omitUndefined({
    slug: params.slug,
    splitId: params.splitId,
    createdBy: params.createdBy,
    title: params.title,
    kind: getSplitKind({ kind: params.kind }),
    totalAmount: params.totalAmount,
    organizerName: params.organizerName,
    status: publicSplitStatus(
      { kind: params.kind, status: params.status, settled: params.settled },
      params.settled
    ),
    currency: params.currency || undefined,
    participants: params.participants.map(toPublicShareParticipant),
    updatedAt: params.updatedAt,
  });
}

export function buildSplitPublicSharePayloadFromSplit(
  split: Split,
  extras?: { slug?: string; settled?: boolean; updatedAt?: number; currency?: string }
): Record<string, unknown> {
  const slug = extras?.slug || split.publicSlug || "";
  const settled = extras?.settled ?? split.settled;
  return buildSplitPublicSharePayload({
    splitId: split.id || "",
    slug,
    createdBy: split.createdBy,
    title: split.title,
    kind: split.kind,
    totalAmount: split.totalAmount,
    organizerName: split.createdByName || "Split Organizer",
    settled,
    status: split.status,
    currency: extras?.currency,
    updatedAt: extras?.updatedAt ?? Date.now(),
    participants: split.participants,
  });
}
