/**
 * Self-service claims filed from the public `/split/:slug` page.
 *
 * Every decision lives here as a pure function so it is unit-testable without
 * Firestore, following the `build*Writes -> payload | { error }` convention in
 * `splitLedger.ts`.
 *
 * ## Why claims exist rather than direct writes
 *
 * There is no capability boundary on the group link and there cannot be one:
 * `personSlug` and `claimKeys` are published in a world-readable document, and
 * a secret stored in a world-readable document is not a secret. So anyone
 * holding the link can file a claim as anyone. That is why a claim changes
 * nothing on its own — it is a message to the organizer, who applies it with
 * their own credentials from inside the app.
 *
 * Firestore rules also cannot iterate a list of maps, so an anonymous client
 * could not be constrained to touching only its own row of
 * `splitPublicShares.participants`. Allowing that write at all would let a
 * stranger rewrite every row's amounts. Hence a separate collection plus a
 * pending overlay on read.
 *
 * The document id is derived from `(shareId, participantKey)`, which is the
 * only real anti-abuse lever available without a server: one slot per person
 * per split, `create`-only, re-armed only when the organizer resolves it.
 */

import type { Participant, Split } from "@/shared/types/split";
import type {
  SplitPublicShare,
  SplitPublicShareParticipant,
} from "@/shared/types/splitPublicShare";
import type { SplitClaimType, SplitShareClaim } from "@/shared/types/splitShareClaim";
import { omitUndefined } from "./firestorePayload";
import { formatAmount } from "./formatCurrency";
import { roundMoney } from "./money";
import {
  findParticipantIndex,
  isCollectSplit,
  isParticipantContributing,
  isParticipantShareSettled,
  optOutBlockedReason,
  participantPaidAmount,
  participantRemainingDue,
} from "./splitMath";

export const SPLIT_CLAIM_ID_SEPARATOR = "__";
export const SPLIT_CLAIM_CLOCK_SKEW_MS = 300_000;
const MONEY_EPSILON = 0.009;

/**
 * Field whitelist, asserted verbatim by the Firestore rules. The rules and this
 * list must change together; `splitClaims.rules.contract.test.ts` fails if they
 * drift.
 */
export const SPLIT_CLAIM_FIELDS = [
  "shareId",
  "slug",
  "participantKey",
  "type",
  "amount",
  "status",
  "createdAt",
  "updatedAt",
] as const;

// ---------------------------------------------------------------- document ids

export function splitClaimDocId(shareId: string, participantKey: string): string {
  return `${shareId}${SPLIT_CLAIM_ID_SEPARATOR}${participantKey}`;
}

export function splitClaimDocIds(
  shareId: string | undefined,
  participantKeys: Array<string | undefined>
): string[] {
  if (!shareId) return [];
  return participantKeys
    .filter((key): key is string => Boolean(key))
    .map((key) => splitClaimDocId(shareId, key));
}

/**
 * Splits on the FIRST separator: share ids never contain it, but a participant
 * key theoretically could, and the share id is the half the rules key on.
 */
export function parseSplitClaimDocId(
  id: string
): { shareId: string; participantKey: string } | null {
  const at = id.indexOf(SPLIT_CLAIM_ID_SEPARATOR);
  if (at <= 0) return null;
  const shareId = id.slice(0, at);
  const participantKey = id.slice(at + SPLIT_CLAIM_ID_SEPARATOR.length);
  if (!shareId || !participantKey) return null;
  return { shareId, participantKey };
}

// ------------------------------------------------------------- public: gating

type ClaimableShare = Pick<
  SplitPublicShare,
  "id" | "slug" | "status" | "claimsEnabled" | "claimKeys" | "claimAmountMax"
>;

/** Null when this person may file a claim right now, else the reason they cannot. */
export function publicClaimBlockedReason(
  share: ClaimableShare | null | undefined,
  participantKey: string | undefined,
  existing?: SplitShareClaim | null
): string | null {
  if (!share || !share.id) return "This split link is no longer available.";
  // Absent means closed: shares written before claims existed carry no flag,
  // and the rules reject them until the organizer next touches the split.
  if (share.claimsEnabled !== true) {
    return "The organizer has turned off updates for this link.";
  }
  if (share.status === "settled" || share.status === "spent") {
    return "This split is already closed.";
  }
  if (!participantKey) return "This row can't be updated from the link.";
  if (!(share.claimKeys || []).includes(participantKey)) {
    return "This row can't be updated from the link.";
  }
  if (existing) {
    return "You've already sent this. The organizer still has to confirm it.";
  }
  return null;
}

/**
 * Parses and bounds a claimed amount. Capped at the row's own share so the
 * worst mis-entry is bounded by what that person could owe, and at the share's
 * `claimAmountMax` so it can never exceed what the rules accept.
 */
export function clampClaimAmount(
  row: Pick<SplitPublicShareParticipant, "amount">,
  raw: string | number,
  claimAmountMax: number
): { amount: number } | { error: string } {
  const parsed = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(parsed)) return { error: "Enter a valid amount." };
  if (parsed <= 0) return { error: "Enter an amount greater than zero." };

  const rowShare = Number(row.amount) || 0;
  const ceiling = Math.min(
    rowShare > 0 ? rowShare : parsed,
    Number.isFinite(claimAmountMax) && claimAmountMax > 0 ? claimAmountMax : parsed
  );
  if (parsed > ceiling + MONEY_EPSILON) {
    return { amount: roundMoney(ceiling) };
  }
  return { amount: roundMoney(parsed) };
}

export function buildSplitClaimPayload(params: {
  share: ClaimableShare;
  participantKey: string;
  type: SplitClaimType;
  amount: number;
  now: number;
  existing?: SplitShareClaim | null;
}): { docId: string; payload: Record<string, unknown> } | { error: string } {
  const blocked = publicClaimBlockedReason(
    params.share,
    params.participantKey,
    params.existing
  );
  if (blocked) return { error: blocked };

  // An opt-out moves no money, so its amount is always zero.
  const amount = params.type === "optOut" ? 0 : roundMoney(params.amount);
  if (params.type === "paid") {
    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: "Enter an amount greater than zero." };
    }
    const max = Number(params.share.claimAmountMax);
    if (Number.isFinite(max) && amount > max) {
      return { error: "That amount is more than the whole split." };
    }
  }

  const shareId = params.share.id as string;
  return {
    docId: splitClaimDocId(shareId, params.participantKey),
    payload: omitUndefined({
      shareId,
      slug: params.share.slug,
      participantKey: params.participantKey,
      type: params.type,
      amount,
      status: "pending" as const,
      createdAt: params.now,
      updatedAt: params.now,
    }),
  };
}

// -------------------------------------------------------- public: read overlay

export type PendingClaimRow = SplitPublicShareParticipant & {
  pending?: { type: SplitClaimType; amount: number; createdAt: number };
};

/**
 * Overlays pending claims onto the published rows.
 *
 * A claim already covered by the authoritative `paidAmount` is dropped: the
 * organizer has applied it and the claim doc simply has not been removed from
 * this device's cache yet. Showing it would make a settled row look unapplied.
 */
export function mergePendingClaims(
  share: Pick<SplitPublicShare, "participants">,
  claims: SplitShareClaim[]
): PendingClaimRow[] {
  const byKey = new Map<string, SplitShareClaim>();
  for (const claim of claims || []) {
    if (claim?.participantKey) byKey.set(claim.participantKey, claim);
  }

  return (share.participants || []).map((row) => {
    const claim = row.claimKey ? byKey.get(row.claimKey) : undefined;
    if (!claim) return { ...row };
    if (row.optedOut) return { ...row };
    if (claim.type === "paid" && row.paidAmount + MONEY_EPSILON >= claim.amount) {
      return { ...row };
    }
    return {
      ...row,
      pending: {
        type: claim.type,
        amount: claim.amount,
        createdAt: claim.createdAt,
      },
    };
  });
}

export function pendingClaimLabel(
  row: PendingClaimRow,
  opts: { organizerName: string; currency: string }
): string | null {
  if (!row.pending) return null;
  if (row.pending.type === "optOut") {
    return `You told ${opts.organizerName} you won't contribute — waiting for them to confirm`;
  }
  const amount = formatAmount(row.pending.amount, opts.currency, {
    fixedDecimals: true,
  });
  return `You told ${opts.organizerName} you've paid ${amount} — waiting for them to confirm`;
}

// ------------------------------------------------------- organizer: apply plan

export type ClaimApplyPlan =
  | {
      action: "togglePaid";
      participantIndex: number;
      participantKey: string;
      paidAmount: number;
    }
  | { action: "markCollected"; participantKey: string; requiresAccount: true }
  | { action: "optOut"; participantKey: string }
  | { action: "dismiss"; reason: string };

/**
 * Which write path a claim takes. This is the money-integrity boundary:
 *
 * - `bill` + `paid` only flips fields on the `splits` doc; no ledger entry.
 * - `collect` + `paid` credits a real account, and the account id can only come
 *   from the signed-in organizer, so an anonymous claim cannot complete it.
 * - `optOut` raises everyone else's share, so it is never automatic.
 */
export function claimApplyPlan(split: Split, claim: SplitShareClaim): ClaimApplyPlan {
  const index = findParticipantIndex(split, claim.participantKey);
  if (index < 0) {
    return { action: "dismiss", reason: "That person is no longer in this split." };
  }
  const target = split.participants[index];
  if (target.isCurrentUser) {
    return { action: "dismiss", reason: "This is your own share." };
  }

  if (claim.type === "optOut") {
    const blocked = optOutBlockedReason(split, claim.participantKey);
    if (blocked) return { action: "dismiss", reason: blocked };
    return { action: "optOut", participantKey: claim.participantKey };
  }

  if (!isParticipantContributing(target)) {
    return { action: "dismiss", reason: "This person isn't contributing." };
  }
  if (participantRemainingDue(target) <= MONEY_EPSILON) {
    return { action: "dismiss", reason: "This share is already settled." };
  }

  if (isCollectSplit(split)) {
    if (split.status === "spent") {
      return { action: "dismiss", reason: "This pot has already been spent." };
    }
    // Needs the organizer to name the receiving account.
    return {
      action: "markCollected",
      participantKey: claim.participantKey,
      requiresAccount: true,
    };
  }

  return {
    action: "togglePaid",
    participantIndex: index,
    participantKey: claim.participantKey,
    paidAmount: roundMoney(claim.amount),
  };
}

/**
 * Applies a `bill` + `paid` claim. Writes `paidAmount` ABSOLUTELY, never as an
 * increment, so replaying the same claim is a no-op rather than a double count.
 */
export function buildApplyPaidClaimWrites(params: {
  split: Split;
  claim: SplitShareClaim;
}): { participants: Participant[]; settled: boolean } | { error: string } {
  const plan = claimApplyPlan(params.split, params.claim);
  if (plan.action !== "togglePaid") {
    return {
      error:
        plan.action === "dismiss"
          ? plan.reason
          : "This update has to be applied from the participant's row.",
    };
  }

  const participants = params.split.participants.map((p, idx) => {
    if (idx !== plan.participantIndex) return p;
    const share = Number(p.amount) || 0;
    const paidAmount = roundMoney(Math.min(share, Math.max(0, plan.paidAmount)));
    const next = { ...p, paidAmount };
    return { ...next, paid: isParticipantShareSettled(next) };
  });

  return {
    participants,
    settled: participants.every((p) => isParticipantShareSettled(p)),
  };
}

export function describeClaimForOrganizer(
  claim: SplitShareClaim,
  split: Split,
  currency: string
): { name: string; headline: string; detail: string; destructive: boolean } {
  const index = findParticipantIndex(split, claim.participantKey);
  const target = index >= 0 ? split.participants[index] : undefined;
  const name = target?.name || "Someone";

  if (claim.type === "optOut") {
    return {
      name,
      headline: `${name} says they won't contribute`,
      detail: "Everyone still in will cover their share.",
      destructive: true,
    };
  }

  const share = target ? Number(target.amount) || 0 : 0;
  const claimed = formatAmount(claim.amount, currency, { fixedDecimals: true });
  const full = formatAmount(share, currency, { fixedDecimals: true });
  const alreadyPaid = target ? participantPaidAmount(target) : 0;

  return {
    name,
    headline: `${name} says they've paid ${claimed} of ${full}`,
    detail:
      claim.amount + MONEY_EPSILON < share
        ? `Recording this leaves ${formatAmount(
            roundMoney(share - claim.amount),
            currency,
            { fixedDecimals: true }
          )} still due.`
        : alreadyPaid > MONEY_EPSILON
          ? "Recording this settles their share."
          : "Recording this marks their share settled.",
    destructive: false,
  };
}

/** Claim doc ids belonging to a split, for cascade deletes. */
export function splitClaimDocIdsForSplit(
  split: Pick<Split, "publicShareId" | "participants">
): string[] {
  return splitClaimDocIds(
    split.publicShareId,
    (split.participants || []).map((p) => p.key)
  );
}
