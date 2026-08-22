import type { SplitKind } from "./split";

/** Sanitized participant row on the public split page — no user ids, accounts, or UPI. */
export type SplitPublicShareParticipant = {
  name: string;
  amount: number;
  paidAmount: number;
  remainingDue: number;
  optedOut: boolean;
  isOrganizer: boolean;
  personSlug?: string;
  /**
   * Participant key. Addresses this row's single self-service claim slot.
   * Not a secret — it authorizes nothing beyond filing a reviewable claim.
   */
  claimKey?: string;
  /** Share rose after someone dropped out, so `remainingDue` is a top-up. */
  shareRaised?: boolean;
};

/**
 * World-readable snapshot of a split. Backs `/split/:slug`.
 * Keep this free of account ids, user ids, and UPI.
 */
export type SplitPublicShare = {
  id?: string;
  slug: string;
  splitId: string;
  createdBy: string;
  title: string;
  kind: SplitKind;
  totalAmount: number;
  organizerName: string;
  status: string;
  currency?: string;
  /** Names only, of people who dropped out. Explains a raised share. */
  optedOutNames?: string[];
  /**
   * Flat copy of the participant keys eligible to file a claim. Firestore
   * rules cannot iterate `participants` (a list of maps), so the claim rule
   * checks membership here instead.
   */
  claimKeys?: string[];
  /**
   * Upper bound the rules apply to a claimed amount. A scalar, not a per-key
   * map: the share is written with `{ merge: true }`, and merge *merges*
   * nested maps, so a removed participant's entry would survive forever as a
   * stale bound. Arrays and scalars are replaced wholesale. The tighter
   * per-row cap is applied client-side.
   */
  claimAmountMax?: number;
  /** Organizer kill switch for public self-service. Absent = closed. */
  claimsEnabled?: boolean;
  participants: SplitPublicShareParticipant[];
  updatedAt: number;
};
