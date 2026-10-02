/**
 * Append-only journal of expense/income edits and soft-deletes (SPENDLY-38),
 * plus credit-card bill payment corrections (SPENDLY-385).
 */

/**
 * SPENDLY-110 adds "restore". This is a stored value, so older documents carry
 * only "update" | "delete" and a future build may add more — renderers must
 * treat an unrecognised action as an edit rather than dropping the event, or
 * the audit trail silently loses history.
 */
export type LedgerEventAction = "update" | "delete" | "restore";
export type LedgerEventKind = "expense" | "income" | "payment";

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
  /**
   * Payment events only (SPENDLY-385). `accountId` holds the paying account
   * (`fromAccountId`, or the `"external"` sentinel) so the existing diff and
   * labels keep working; these carry the rest of the payment's identity.
   */
  toAccountId?: string;
  sourceType?: string;
  creditCardBillId?: string;
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
