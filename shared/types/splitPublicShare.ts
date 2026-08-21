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
  participants: SplitPublicShareParticipant[];
  updatedAt: number;
};
