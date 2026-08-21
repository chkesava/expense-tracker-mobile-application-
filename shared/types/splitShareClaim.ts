/** What a visitor is telling the organizer from the public `/split/:slug` page. */
export type SplitClaimType = "paid" | "optOut";

/**
 * A self-service update filed from the public split page by someone who is not
 * signed in. This is the only document in the project that accepts an
 * unauthenticated write.
 *
 * A claim changes nothing on its own: it credits no account and does not touch
 * the public snapshot. The organizer applies it from inside the app, which is
 * the whole security model — `personSlug` and `claimKeys` are already
 * world-readable, so anyone holding the group link can file a claim as anyone,
 * and no secret stored in a world-readable document could fix that.
 *
 * The document id is always `{shareId}__{participantKey}` (see
 * `splitClaimDocId`), which is what bounds the anonymous write volume: one
 * slot per person per split, re-armed only when the organizer applies or
 * dismisses.
 */
export type SplitShareClaim = {
  id?: string;
  /** `splitPublicShares` doc id. Also the document id prefix. */
  shareId: string;
  /** Share slug; the rules require it to match the parent share. */
  slug: string;
  participantKey: string;
  type: SplitClaimType;
  /**
   * TOTAL paid toward this share, not a delta. Absolute on purpose: applying
   * the claim is then a set-to-value, so a replay is a no-op rather than a
   * double credit. Always 0 for `optOut`.
   */
  amount: number;
  status: "pending";
  createdAt: number;
  updatedAt: number;
};
