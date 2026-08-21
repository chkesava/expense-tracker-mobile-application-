import type { Participant, Split } from "@/shared/types/split";
import type {
  SplitPublicShare,
  SplitPublicShareParticipant,
} from "@/shared/types/splitPublicShare";
import { omitUndefined } from "./firestorePayload";
import { formatAmount } from "./formatCurrency";
import {
  getSplitKind,
  isParticipantContributing,
  participantPaidAmount,
  participantRemainingDue,
  publicSplitStatus,
} from "./splitMath";

/**
 * Currency for a public page when the snapshot predates currency threading.
 * The public pages must never fall back to `system_settings/global`: that
 * document requires sign-in, so an anonymous visitor's read always fails and
 * every share would silently render as INR.
 */
export const PUBLIC_FALLBACK_CURRENCY = "INR";

/** Threshold for "this share is settled", matching `isParticipantShareSettled`. */
const MONEY_EPSILON = 0.009;

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
    claimKey: p.key || undefined,
    shareRaised: p.shareRaised ? true : undefined,
  }) as SplitPublicShareParticipant;
}

/**
 * Participant keys allowed to file a self-service claim: everyone still
 * contributing, except the organizer (who acts from inside the app) and legacy
 * participants that never got a key.
 */
export function publicClaimKeys(participants: Participant[]): string[] {
  return (participants || [])
    .filter((p) => !p.isCurrentUser && isParticipantContributing(p) && p.key)
    .map((p) => p.key as string);
}

/** Names of people who dropped out, in participant order. Explains a raised share. */
export function publicOptedOutNames(participants: Participant[]): string[] {
  return (participants || [])
    .filter((p) => !isParticipantContributing(p))
    .map((p) => p.name);
}

/** "Bob", "Bob and Dana", "Bob and 2 others". */
function describeDropouts(names: string[]): string {
  if (names.length === 0) return "someone";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} others`;
}

/**
 * The one-line status under a name on the public page.
 *
 * A raised share is read from the explicit `shareRaised` flag rather than
 * inferred from `0 < paidAmount < amount`: self-service claims can be partial
 * payments, which look identical but mean something different.
 */
export function publicParticipantStatusLabel(
  row: Pick<
    SplitPublicShareParticipant,
    "paidAmount" | "remainingDue" | "optedOut" | "shareRaised"
  >,
  opts: { optedOutNames?: string[]; currency: string }
): string {
  if (row.optedOut) return "Won't contribute";
  if (row.remainingDue <= MONEY_EPSILON) return "Paid";

  const who = describeDropouts(opts.optedOutNames || []);
  if (row.shareRaised) {
    if (row.paidAmount > MONEY_EPSILON) {
      const extra = formatAmount(row.remainingDue, opts.currency, {
        fixedDecimals: true,
      });
      return `Extra ${extra} due after ${who} dropped out`;
    }
    return `Share went up after ${who} dropped out`;
  }

  if (row.paidAmount > MONEY_EPSILON) return "Paid part · remaining due";
  return "Unpaid";
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
  /** Defaults to open. Pass `false` to revoke public self-service. */
  claimsEnabled?: boolean;
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
    optedOutNames: publicOptedOutNames(params.participants),
    claimKeys: publicClaimKeys(params.participants),
    claimAmountMax: Number(params.totalAmount) || 0,
    claimsEnabled: params.claimsEnabled !== false,
    participants: params.participants.map(toPublicShareParticipant),
    updatedAt: params.updatedAt,
  });
}

export function buildSplitPublicSharePayloadFromSplit(
  split: Split,
  extras?: {
    slug?: string;
    settled?: boolean;
    updatedAt?: number;
    currency?: string;
    claimsEnabled?: boolean;
  }
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
    claimsEnabled: extras?.claimsEnabled,
    updatedAt: extras?.updatedAt ?? Date.now(),
    participants: split.participants,
  });
}

/** Currency to render a public share in. Never consults system settings. */
export function publicShareCurrency(
  share: Pick<SplitPublicShare, "currency"> | null | undefined
): string {
  return share?.currency || PUBLIC_FALLBACK_CURRENCY;
}
