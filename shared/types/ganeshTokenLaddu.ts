import type {
  FirestoreTime,
  GaneshAuditFields,
  GaneshVoidFields,
  PaymentMethod,
} from "@/shared/types/ganesh";

/**
 * Token Laddu registration and the Nimarjanam draw (KAN-125).
 *
 * Kept in its own module rather than added to `ganesh.ts` for the same reason
 * `ganeshSessions.ts` is separate: these five shapes are one story — how many
 * laddus exist, who bought which ones, and which ones won — and the rules, the
 * draw endpoint and the PDF all read them together.
 *
 * Two things here are deliberately *not* modelled, and both matter:
 *
 * 1. **The money is not here.** A registration writes an ordinary
 *    `GaneshCollection` in the same transaction and stores its id in
 *    `collectionId`. Festival totals then come from the existing ledger derive
 *    with no new code. These documents must never be added to
 *    `LEDGER_SUBCOLLECTIONS` — they carry the same rupees as that collection
 *    row, and counting both is the double-count KAN-125 explicitly forbids.
 *
 * 2. **A token's identity is its document id.** `TokenLadduToken` has no
 *    `code` field distinct from its id, because the id *is* the code. See the
 *    note on that interface.
 */

/** The doc id of the per-festival config singleton. There is only ever one. */
export const TOKEN_LADDU_CONFIG_DOC_ID = "current";

/**
 * A token's life. Mirrors the existing status vocabulary rather than inventing
 * one — `cancelled` is what every other Ganesh record calls a reversal, and
 * nothing is ever deleted.
 */
export type TokenLadduTokenStatus =
  /** In the pot. The only status the draw may select. */
  | "eligible"
  /** Drawn. Terminal: a token wins at most once. */
  | "winner"
  /** Reversed registration. Ineligible, but kept — the id is never reused. */
  | "cancelled";

export type TokenDrawSessionStatus =
  /** Draws may be committed against it. */
  | "open"
  /** Every configured draw ran, or the operator finalized it. Terminal. */
  | "completed"
  /** Abandoned. Any results already committed stay committed and visible. */
  | "cancelled";

/**
 * Per-festival configuration, and the token-number allocator.
 *
 * The allocator lives here rather than on `summary/totals` on purpose. The
 * summary branch in `firestore.rules` is documented as sitting against
 * Firestore's hard 1000-expression evaluation ceiling — `ganeshSummaryBudget`
 * exists to guard exactly that — and a fourth allocator, with its `okMoney` and
 * monotonicity clauses, would spend budget on the one rule that can least
 * afford it. This document has its own rule with room to spare.
 *
 * `registeredCount` and `cancelledCount` are maintained in the same transaction
 * as the writes they count, so a capacity check never races a registration.
 * They are a concurrency control, not a reporting convenience.
 */
export interface TokenLadduConfig extends GaneshAuditFields {
  /**
   * How many physical laddus the pandal has. Also the number of draws: KAN-125
   * derives the draw count from this single number, so there is nothing to keep
   * in step.
   */
  totalTokens: number;
  /**
   * The fixed price per laddu, where the pandal uses one. Zero means "varies",
   * and the registration form then asks for the amount.
   */
  amountPerToken: number;
  /** Next sequence to hand out. Only ever advances. */
  nextTokenNumber: number;
  /** Tokens created, cancelled included. Compared against `totalTokens`. */
  registeredCount: number;
  /** Subset of `registeredCount` that is no longer eligible. */
  cancelledCount: number;
  /**
   * Why capacity last changed. KAN-125 requires a reason on an authorized
   * capacity change, because raising the limit is how you legitimately exceed
   * what was originally configured.
   */
  capacityReason?: string;
  pendingWrite?: boolean;
}

/**
 * One purchase, from one page of the pandal's printed receipt book.
 *
 * The document id is the `clientOpId` the form generated, which is what makes a
 * double-tap a no-op: the second write finds the document already there and
 * returns. Same mechanism `addCollection` uses.
 */
export interface TokenLadduRegistration extends GaneshAuditFields, GaneshVoidFields {
  id: string;
  participantName: string;
  mobile?: string;
  /** How many laddus this purchase bought. One token document per unit. */
  quantity: number;
  /** Total paid for the whole purchase, not per token. */
  amount: number;
  paymentMethod: PaymentMethod;
  /**
   * The number handwritten in the pandal's physical receipt book.
   *
   * Distinct from `receiptNumber` below, and KAN-125 requires both stay
   * separately searchable. This one is what a participant holds in their hand;
   * the other is what the ledger calls the money.
   */
  receiptNumberPhysical: string;
  /** The ledger's own receipt, e.g. GNS26-000182, from the collection row. */
  receiptNumber?: string;
  /** The `GaneshCollection` this purchase wrote. The money lives there. */
  collectionId: string;
  /** Who took the cash, for the same accountability the ledger tracks. */
  collectorId: string;
  /** yyyy-mm-dd, matching every other Ganesh record. */
  date: string;
  /** Idempotency key. Also the document id. */
  clientOpId?: string;
  notes?: string;
  /** Token numbers this registration allocated, for display without a query. */
  tokenNumbers: number[];
  cancelReason?: string;
  pendingWrite?: boolean;
}

/**
 * One physical laddu, and one entry in the draw.
 *
 * **The document id is the token code** — `TKN26-000042`. Uniqueness is
 * therefore a property of the database rather than a rule we have to enforce
 * and test: a second write to the same code is a create against an existing
 * document and fails. This is the same trick `pandalInvites/{code}` uses for
 * pandal codes and `festivalYears/{year}` uses to stop two festivals claiming a
 * year.
 *
 * Participant details are denormalized onto the token because the draw announces
 * a winner in front of a crowd, and resolving a name through the registration at
 * that moment would mean an extra read on the one operation that must not be
 * slow or fallible.
 */
export interface TokenLadduToken extends GaneshAuditFields {
  /** The human-readable code, e.g. `TKN26-000042`. Equal to the document id. */
  id: string;
  /** The numeric sequence behind the code. Sorts correctly; the code does too. */
  tokenNumber: number;
  status: TokenLadduTokenStatus;
  /** The purchase this came from. Never reassigned. */
  registrationId: string;
  participantName: string;
  mobile?: string;
  receiptNumberPhysical: string;
  date: string;
  /**
   * This token's share of the purchase — the registration's amount split across
   * its quantity. Present so the token list and the PDF can show a per-token
   * figure without re-deriving it per row.
   */
  amount: number;
  paymentMethod: PaymentMethod;
  /** Set only by the trusted draw endpoint. Clients cannot write these. */
  wonAt?: FirestoreTime;
  wonDrawSessionId?: string;
  wonDrawSequence?: number;
  cancelReason?: string;
  cancelledBy?: string;
  cancelledAt?: FirestoreTime;
  pendingWrite?: boolean;
}

/**
 * One run of the draw, normally at Nimarjanam.
 *
 * Carries a snapshot of the configuration it started under, because the draw is
 * a public event whose terms must stay auditable even if someone later edits the
 * config. KAN-125 asks for the snapshot explicitly.
 */
export interface TokenDrawSession extends GaneshAuditFields {
  id: string;
  status: TokenDrawSessionStatus;
  startedAt?: FirestoreTime;
  startedBy: string;
  startedByName?: string;
  completedAt?: FirestoreTime;
  completedBy?: string;
  /** Configuration as it stood when the session opened. */
  configuredTokens: number;
  /** How many draws this session intends to run. Derived from the config. */
  plannedDraws: number;
  /** Draws actually committed. Advanced only by the trusted endpoint. */
  completedDraws: number;
  /**
   * Set when the session stopped because eligible tokens ran out before the
   * planned draws did. KAN-125 requires we stop and say so rather than invent
   * winners.
   */
  shortfallAt?: number;
  cancelReason?: string;
  pendingWrite?: boolean;
}

/**
 * One winner. Append-only, and written only by the trusted draw endpoint.
 *
 * **The document id is `${sessionId}__${sequence}`.** Two admins racing the
 * same draw sequence cannot both commit, because the second one is a create
 * against a document that now exists — the concurrency guarantee is structural
 * rather than a check someone could forget to run. Firestore rules deny every
 * client write to this collection, so the server is the only writer.
 */
export interface TokenDrawResult {
  /** `${drawSessionId}__${sequence}`. */
  id: string;
  drawSessionId: string;
  /** 1-based position in the draw order. */
  sequence: number;
  /** The winning token's code, which is also its document id. */
  tokenId: string;
  tokenNumber: number;
  registrationId: string;
  participantName: string;
  mobile?: string;
  receiptNumberPhysical: string;
  drawnAt?: FirestoreTime;
  /** The authorized user who ran this draw. */
  drawnBy: string;
  drawnByName?: string;
  /** Eligible tokens in the pot at the moment of selection. */
  eligibleCount: number;
}

/** A config document for a festival that has never been configured. */
export const EMPTY_TOKEN_LADDU_CONFIG: TokenLadduConfig = {
  totalTokens: 0,
  amountPerToken: 0,
  nextTokenNumber: 0,
  registeredCount: 0,
  cancelledCount: 0,
  createdBy: "",
  updatedBy: "",
};
