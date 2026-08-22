/**
 * Deciding whether a split can be shared, and what has to be written first.
 *
 * Two defects motivate this module, both of which failed silently:
 *
 *  1. `publicSlug`/`publicShareId` were only minted on create or as a side
 *     effect of paid/collect/settle/opt-out, so a split created before public
 *     links existed had neither. The share sheet then opened with a message and
 *     no link, and nothing told the organizer.
 *  2. `buildParticipantShareRequests` returns `[]` without a UPI id, so no
 *     `paymentSlug` was stored and the public page could never show a Pay
 *     button — not even after the organizer added a UPI id later, because the
 *     sync path only patches requests that already exist.
 *
 * Keeping the decisions here (rather than in the hook) makes both repairable
 * states unit-testable without Firestore.
 */

import type { Participant, Split } from "@/shared/types/split";
import { getPaymentRequestShareUrl, getSplitShareUrl } from "./paymentRequestUrl";
import { isParticipantContributing } from "./splitMath";

export const NO_UPI_PAY_LINK_REASON =
  "Add your UPI ID in Settings to create pay links.";

export const NO_ORIGIN_SHARE_REASON =
  "Share links aren't configured for this build.";

export type SplitShareLinkState =
  | { ready: true; url: string }
  | { ready: false; reason: "no-origin" | "no-slug"; message: string };

function resolveLink(
  slug: string | undefined,
  origin: string,
  toUrl: (slug: string) => string
): SplitShareLinkState {
  if (!origin) {
    return { ready: false, reason: "no-origin", message: NO_ORIGIN_SHARE_REASON };
  }
  if (!slug) {
    return {
      ready: false,
      reason: "no-slug",
      message: "This split doesn't have a link yet.",
    };
  }
  return { ready: true, url: toUrl(slug) };
}

export function resolveSplitShareLink(params: {
  publicSlug?: string;
  origin: string;
}): SplitShareLinkState {
  return resolveLink(params.publicSlug, params.origin, getSplitShareUrl);
}

export function resolvePersonShareLink(params: {
  paymentSlug?: string;
  origin: string;
}): SplitShareLinkState {
  return resolveLink(
    params.paymentSlug,
    params.origin,
    getPaymentRequestShareUrl
  );
}

export type SplitSharingRepairPlan = {
  /** No `publicSlug` yet — the group link cannot be built. */
  needsSlug: boolean;
  /** No `publicShareId` yet — there is no world-readable snapshot to read. */
  needsShareDoc: boolean;
  /** Contributing non-organizer keys with no `paymentSlug`/`paymentRequestId`. */
  keysMissingPayLink: string[];
  /** Set when pay links cannot be built at all, with copy explaining why. */
  payLinkBlockedReason?: string;
};

/** Participants who should have a pay page but do not. */
function participantsMissingPayLink(participants: Participant[]): Participant[] {
  return (participants || []).filter(
    (p) =>
      !p.isCurrentUser &&
      Boolean(p.key) &&
      isParticipantContributing(p) &&
      !(p.paymentRequestId || p.paymentSlug)
  );
}

export function planSplitSharingRepair(
  split: Pick<Split, "publicSlug" | "publicShareId" | "participants">,
  opts: { upiId: string }
): SplitSharingRepairPlan {
  const upiId = (opts.upiId || "").trim();
  const missing = participantsMissingPayLink(split.participants || []);

  // Without a UPI id there is no payment page to point at, so returning an
  // empty list is correct — but the caller has to be able to say why.
  if (!upiId) {
    return {
      needsSlug: !split.publicSlug,
      needsShareDoc: !split.publicShareId,
      keysMissingPayLink: [],
      payLinkBlockedReason: missing.length > 0 ? NO_UPI_PAY_LINK_REASON : undefined,
    };
  }

  return {
    needsSlug: !split.publicSlug,
    needsShareDoc: !split.publicShareId,
    keysMissingPayLink: missing.map((p) => p.key as string),
  };
}

/**
 * True when nothing is missing that this plan can see: slug, share doc, pay
 * links.
 *
 * Note what it deliberately cannot tell you: whether the *published snapshot*
 * is stale. A split shared by an older build has all three of those and still
 * needs its snapshot rewritten, so callers must not use this to skip the
 * snapshot write -- only to skip creating payment requests, and to report
 * whether anything was actually created.
 */
export function isSharingRepairNoop(plan: SplitSharingRepairPlan): boolean {
  return (
    !plan.needsSlug &&
    !plan.needsShareDoc &&
    plan.keysMissingPayLink.length === 0
  );
}

/** Existing `participantKey -> paymentSlug` pairs, for building reminder links. */
export function paySlugsByKey(
  participants: Participant[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of participants || []) {
    if (p.key && p.paymentSlug) out[p.key] = p.paymentSlug;
  }
  return out;
}
