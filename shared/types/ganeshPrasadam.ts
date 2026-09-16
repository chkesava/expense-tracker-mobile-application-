import type {
  GaneshAuditFields,
  GaneshVoidFields,
} from "@/shared/types/ganesh";

/**
 * The daily prasadam register (KAN-126).
 *
 * A pandal is fed twice a day, every day of the festival, by whoever in the
 * community brings something. This module records **who brought what, to which
 * session, on which day** — one document per offering.
 *
 * Three things here are deliberate, and each one exists to stop a specific bug:
 *
 * 1. **This is not `SevaKind = "prasadam"`.** That value means *a slot on the
 *    programme* ("annadanam, 6pm") and lives on `FestivalSeva`. This collection
 *    is the *register of providers*. The two coexist on purpose; neither
 *    derives from the other. A `sevaId` may link an entry to the slot it was
 *    served at, but nothing computes anything from it.
 *
 * 2. **There is no money here, at all.** No `amount`, no `estimatedValue`, no
 *    `purposeType`. `firestore.rules` *enforces* their absence rather than
 *    trusting this comment, which is what makes "prasadam can never be
 *    double-counted" a property of the database. These documents must never be
 *    added to `LEDGER_SUBCOLLECTIONS`.
 *
 *    Note this diverges from `GaneshContribution` kind `"item"`, which *does*
 *    carry `estimatedValue` and *does* reach `summary.inKindValue`. Do not
 *    "harmonise" them. If someone needs to know what the prasadam was worth,
 *    the answer is to record a contribution, not to add a field here.
 *
 * 3. **A session is not a document.** Morning and evening are the two values of
 *    `session` on each entry; a session's counts, status and empty state are
 *    derived from the entries that carry it. A stored session document holding
 *    counts would be shared mutable state, and two volunteers recording at the
 *    same counter at the same moment would clobber it. Each writer touching
 *    only its own document is what makes concurrent entry safe.
 */

/**
 * The two daily sessions. Independent buckets: the same person providing at
 * both is two entries, not one entry with a flag.
 */
export type PrasadamSession = "morning" | "evening";

/**
 * An entry's life. Reuses the existing vocabulary rather than inventing one —
 * `cancelled` is what every other Ganesh record calls a reversal.
 *
 * `cancelled` is **terminal**: a cancelled entry cannot be edited or restored,
 * matching `assertCanCancelContribution`. A mistaken cancellation is corrected
 * by recording a fresh entry, which leaves the correction visible in the audit
 * trail instead of hiding it.
 */
export type PrasadamStatus = "recorded" | "cancelled";

/**
 * Units a pandal actually measures prasadam in.
 *
 * Critically, these are **not** interconvertible and must never be summed
 * across. See `PrasadamSessionSummary.byUnit`.
 */
export type PrasadamUnit =
  | "kg"
  | "grams"
  | "litres"
  | "pieces"
  | "packets"
  | "plates"
  | "boxes"
  | "other";

/** Broad category, for filtering and for the report's type breakdown. */
export type PrasadamType =
  | "sweet"
  | "savoury"
  | "fruit"
  | "meal"
  | "drink"
  | "laddu"
  | "other";

/** Display order for units, so two summaries of the same data read alike. */
export const PRASADAM_UNIT_ORDER: readonly PrasadamUnit[] = [
  "kg",
  "grams",
  "litres",
  "pieces",
  "packets",
  "plates",
  "boxes",
  "other",
] as const;

export const PRASADAM_TYPE_ORDER: readonly PrasadamType[] = [
  "sweet",
  "savoury",
  "laddu",
  "meal",
  "fruit",
  "drink",
  "other",
] as const;

/**
 * One offering, by one provider, to one session, on one day.
 *
 * The document id is the form's `clientOpId`, so a double tap or a retried
 * write re-targets the same document and can never mint a second row — the same
 * mechanism `addContribution` and `registerTokenLaddu` use.
 *
 * It is deliberately **not** a composite id like `date__session__providerId`:
 * that shape is precisely what makes a second provider in the same session
 * overwrite the first, which is the thing KAN-126 exists to prevent.
 */
export interface PrasadamEntry extends GaneshAuditFields, GaneshVoidFields {
  id: string;
  /**
   * ISO `yyyy-mm-dd`. Stored as a string so it sorts and compares lexically,
   * matching `FestivalSeva.date`. Never a `Date`.
   *
   * Immutable after creation — moving an entry to another day is a cancel and a
   * re-add, so a day's counts stay reconcilable against its history.
   */
  date: string;
  /** Immutable after creation, for the same reason as `date`. */
  session: PrasadamSession;
  /**
   * Snapshot, always present — even when `providerId` is set. A member renaming
   * themselves, or leaving the festival, must not rewrite last year's register.
   * Same doctrine as `GaneshCollection.donorName` alongside `householdId`.
   */
  providerName: string;
  /**
   * Optional link to a household or festival member. Walk-in devotees are the
   * common case, so requiring this would make the fast path the slow path.
   */
  providerId?: string;
  /** Which collection `providerId` points into. Absent when unlinked. */
  providerSource?: "member" | "household";
  /** Snapshot, for the same reason as `providerName`. */
  mobile?: string;
  prasadamType: PrasadamType;
  /** The dish as the committee would say it — "pulihora", "kesari". */
  prasadamLabel?: string;
  /** A number, not free text: per-unit totals are impossible otherwise. */
  quantity: number;
  unit: PrasadamUnit;
  /** Required when `unit === "other"`; names the unit the pandal used. */
  unitLabel?: string;
  notes?: string;
  status: PrasadamStatus;
  cancelReason?: string;
  /**
   * The scheduled seva this was served at, where there is one. Decorative: it
   * links the register to the programme for a reader. Nothing derives from it,
   * and an entry is complete without it.
   */
  sevaId?: string;
  /** Echo of the document id. Kept for the audit trail's benefit. */
  clientOpId?: string;
  /** Firestore's `hasPendingWrites`, surfaced by the collection hook. */
  pendingWrite?: boolean;
}

/**
 * A quantity total for one unit.
 *
 * Totals are a **vector, not a scalar**. The only sound aggregate across mixed
 * units is a per-unit breakdown: "5 kg + 30 pieces" has no single number, and
 * there is deliberately no API in this feature that can produce one.
 */
export interface PrasadamUnitTotal {
  unit: PrasadamUnit;
  /** The pandal's own word, when `unit === "other"`. */
  unitLabel?: string;
  quantity: number;
  entryCount: number;
}

/** Derived counts for one `(date, session)` pair. Never stored. */
export interface PrasadamSessionSummary {
  /** Always safe to add up. */
  entryCount: number;
  /** Distinct people: by `providerId` when linked, else by name + mobile. */
  providerCount: number;
  /** Cancelled entries, counted apart so a reversal is visible, not erased. */
  cancelledCount: number;
  /**
   * Per-unit quantities, in `PRASADAM_UNIT_ORDER`. Excludes cancelled entries.
   * There is no `totalQuantity` sibling, and there must never be one.
   */
  byUnit: PrasadamUnitTotal[];
  byType: Array<{ type: PrasadamType; entryCount: number }>;
}

/** Both sessions of one festival day. */
export interface PrasadamDaySummary {
  date: string;
  /** "Day 4 of 10", when the festival has a window. */
  dayNumber?: number;
  morning: PrasadamSessionSummary;
  evening: PrasadamSessionSummary;
  /** Across both sessions — distinct providers, not morning + evening. */
  providerCount: number;
  entryCount: number;
}

/**
 * Where a session sits relative to the clock. Derived, never stored: a flag
 * would need someone to remember to flip it, and nobody ever does.
 */
export type PrasadamSessionState =
  /** In the future, or today but not yet begun, with nothing recorded. */
  | "not-started"
  /** Today, within or past its window, with entries recorded. */
  | "in-progress"
  /** A past day with entries. */
  | "recorded"
  /** Entries exist but every one of them is cancelled. */
  | "cancelled"
  /** A past day with nothing recorded. Nobody is coming now. */
  | "missed";
