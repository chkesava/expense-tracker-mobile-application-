export type SplitType = "equal" | "custom";

/** `bill` = already paid, settle up. `collect` = gather money, spend later. */
export type SplitKind = "bill" | "collect";

/** Collect pots only. Legacy bill splits omit this. */
export type SplitCollectStatus = "collecting" | "spent" | "settled";

export interface Participant {
  /** Stable id so paid/collection updates do not depend on array index. */
  key?: string;
  name: string;
  amount: number;
  paid: boolean;
  /**
   * Money already marked collected/paid toward `amount`.
   * After someone drops out, remaining people may owe a top-up on top of this.
   * Missing on legacy docs: treat `paid` as the whole `amount`.
   */
  paidAmount?: number;
  /** False = will not pay; stays on the list for history. Default true. */
  contributing?: boolean;
  upiId?: string;
  isCurrentUser: boolean;
  userId?: string;
  photoURL?: string;
  /** Account that received this friend's UPI (collect mode). */
  receivedAccountId?: string;
  /** `users/{uid}/accountEntries` credit created when marked collected. */
  collectedEntryId?: string;
  /** Extra credits from top-ups after a share increase. */
  collectedEntryIds?: string[];
  /** Public `/payment/:slug` for this friend's share. */
  paymentSlug?: string;
  paymentRequestId?: string;
  /**
   * Share went up because someone else dropped out, so `remainingDue` is a
   * top-up rather than an unpaid original share. Recorded rather than derived
   * from `0 < paidAmount < amount`: public self-service claims create genuine
   * partial payments, which look identical.
   */
  shareRaised?: boolean;
}

export interface Split {
  id?: string;
  title: string;
  totalAmount: number;
  splitType: SplitType;
  participants: Participant[];
  createdBy: string;
  createdAt: number;
  settled: boolean;
  notes?: string;
  category?: string;
  participantIds: string[];
  createdByName?: string;
  /** Defaults to `bill` when missing (legacy documents). */
  kind?: SplitKind;
  status?: SplitCollectStatus;
  spentAccountId?: string;
  spentAmount?: number;
  spentExpenseId?: string;
  spendPassThroughEntryId?: string;
  paymentRequestIds?: string[];
  /** Public `/split/:slug` snapshot. */
  publicSlug?: string;
  publicShareId?: string;
  /**
   * Whether people holding the public link may file self-service updates.
   * Owned here, mirrored onto the world-readable share (which is where the
   * Firestore rules read it). Absent means on.
   */
  claimsEnabled?: boolean;
}
