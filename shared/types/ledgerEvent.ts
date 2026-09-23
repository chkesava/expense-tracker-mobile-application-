/** Append-only journal of expense/income edits and soft-deletes (SPENDLY-38). */

export type LedgerEventAction = "update" | "delete";
export type LedgerEventKind = "expense" | "income";

/** Primitive snapshot stored on a ledger event. No Timestamp objects. */
export type LedgerEventSnapshot = {
  amount: number;
  date: string;
  month: string;
  accountId: string | null;
  note: string;
  category?: string;
  subcategory?: string;
  source?: string;
  tags?: string[];
  spaceId?: string | null;
  tripId?: string | null;
  splitId?: string;
  subscriptionId?: string;
  /** Kept across corrections so SMS provenance survives edits (SPENDLY-108). */
  smsFingerprint?: string;
  smsExternalRef?: string;
};

export interface LedgerEvent {
  id: string;
  kind: LedgerEventKind;
  docId: string;
  action: LedgerEventAction;
  before: LedgerEventSnapshot;
  after: LedgerEventSnapshot | null;
  actorUid: string;
  reason?: string;
  createdAt: unknown;
}
