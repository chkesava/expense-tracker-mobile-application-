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
  upiId?: string;
  isCurrentUser: boolean;
  userId?: string;
  photoURL?: string;
  /** Account that received this friend's UPI (collect mode). */
  receivedAccountId?: string;
  /** `users/{uid}/accountEntries` credit created when marked collected. */
  collectedEntryId?: string;
  /** Public `/payment/:slug` for this friend's share. */
  paymentSlug?: string;
  paymentRequestId?: string;
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
}
