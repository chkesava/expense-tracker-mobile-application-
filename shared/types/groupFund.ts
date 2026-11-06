/**
 * SPENDLY-683 — Group Funds data contract (epic SPENDLY-678).
 *
 * A group fund is money the user holds for other people (a Dokra pool, a
 * committee kitty). It sits in the user's real bank or cash accounts, so it
 * moves real balances, but it is never the user's income, expense or wealth.
 *
 * Two stores, both under `users/{uid}`:
 *   - `groupFunds/{fundId}`       — the pool: purposes, members and the stored
 *     running totals. The UI reads these totals; it never adds events up.
 *   - `groupFundEvents/{eventId}` — the append-only history. The event id is
 *     the client idempotency key. Events are never updated or deleted; a
 *     mistake is undone by a `reversal` event.
 *
 * Money that moves a real account also writes one `accountEntries` row per
 * account leg (source `group_fund_*`, fixed id derived from the event id), in
 * the same batch. That row is what moves `currentBalance`, so the account is
 * credited or debited exactly once and the balance rebuild sees it.
 *
 * Invariant (checked by `reconcileGroupFund`):
 *   stored totals == rebuildGroupFundTotals(events)
 *   held = opening + contributions + transfersIn − payouts − transfersOut
 *
 * Full design: docs/SPENDLY-678-group-funds.md
 */

/** Persisted ids — append only, never rename. Missing `status` means active. */
export const GROUP_FUND_STATUSES = ["active", "archived"] as const;
export type GroupFundStatus = (typeof GROUP_FUND_STATUSES)[number];

/** Persisted ids — append only, never rename. */
export const GROUP_FUND_CADENCES = ["monthly", "adhoc"] as const;
export type GroupFundCadence = (typeof GROUP_FUND_CADENCES)[number];

/** Persisted ids — append only, never rename. */
export const GROUP_FUND_EVENT_KINDS = [
  /** Money already held when tracking started. No account leg: it is already in the balance. */
  "opening",
  /** A member paid in. Credits the receiving account. */
  "contribution",
  /** Paid to the centre / recipient. Debits the paying account. */
  "payout",
  /** Moved between purposes of one fund. No account leg. Always written as a pair. */
  "transfer_out",
  "transfer_in",
  /** Held money moved from one of the user's accounts to another. Debit + credit legs. */
  "account_move",
  /** Undoes one earlier event, including its account legs. */
  "reversal",
] as const;
export type GroupFundEventKind = (typeof GROUP_FUND_EVENT_KINDS)[number];

export const GROUP_FUND_SCHEMA_VERSION = 1;

export const GROUP_FUND_LIMITS = {
  /** Mirrors the rules' bounded amount (0 < v < 1e9). */
  maxAmount: 999_999_999,
  nameMax: 60,
  notesMax: 500,
  noteMax: 500,
  recipientMax: 80,
  referenceMax: 80,
  maxPurposes: 20,
  maxMembers: 200,
} as const;

export interface GroupFundPurpose {
  id: string;
  name: string;
  cadence: GroupFundCadence;
  /** Per member per period (monthly) or once (adhoc). Pending is shown only when set. */
  expectedPerMember?: number;
  target?: number;
  archived?: boolean;
}

export interface GroupFundMember {
  id: string;
  name: string;
  archived?: boolean;
  /** SPENDLY-688: first month (YYYY-MM) this member owes. Missing = from the fund's start. */
  joinedPeriod?: string;
  /** SPENDLY-688: first month (YYYY-MM) this member no longer owes. Missing = still owes. */
  leftPeriod?: string;
}

/**
 * Running totals, net of reversals (a reversed contribution lowers
 * `contributions`; the reversal itself stays visible in the history).
 */
export interface GroupFundTotals {
  opening: number;
  contributions: number;
  payouts: number;
  transfersIn: number;
  transfersOut: number;
  /** opening + contributions + transfersIn − payouts − transfersOut. */
  held: number;
}

export interface GroupFund {
  id: string;
  name: string;
  notes?: string;
  status?: GroupFundStatus;
  /**
   * SPENDLY-688: first month (YYYY-MM) of collection. Months before it are
   * never pending. Missing (older funds) = the month the fund was created.
   */
  startPeriod?: string;
  purposes: GroupFundPurpose[];
  members: GroupFundMember[];
  totals: GroupFundTotals;
  byPurpose: Record<string, GroupFundTotals>;
  /** Held money per real account, for reconciliation. Opening money without an account is not here. */
  heldByAccount: Record<string, number>;
  schemaVersion?: number;
  /** +1 on every write. Config edits write a literal next value, so a stale edit is rejected. */
  version?: number;
  lastEventId?: string;
  createdAtMs?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GroupFundEvent {
  id: string;
  fundId: string;
  kind: GroupFundEventKind;
  /** Always positive. The kind gives the direction. */
  amount: number;
  purposeId: string;
  /** Local date the money moved (YYYY-MM-DD). */
  date: string;
  /** YYYY-MM the contribution counts for (defaults to the date's month). */
  period?: string;
  memberId?: string;
  /** contribution / payout / opening: the account. account_move: the source account. */
  accountId?: string;
  /** account_move only: the destination account. */
  toAccountId?: string;
  /** Ids of the `accountEntries` rows this event wrote. */
  accountEntryIds?: string[];
  /**
   * SPENDLY-700: recorded after the fact for money that was already in (or
   * already out of) the account balance. Counts for the member, month and
   * fund totals, but writes no account entry, so no balance moves again.
   * `accountId`, when set, only says where the money sits.
   */
  attributionOnly?: boolean;
  recipient?: string;
  reference?: string;
  note?: string;
  /** transfer_out / transfer_in: the id shared by both halves (the transfer_out id). */
  transferPairId?: string;
  /** reversal: the event it undoes. */
  reversalOf?: string;
  /** reversal: a copy of the undone event's kind, so totals can be rebuilt from this row alone. */
  reversedKind?: Exclude<GroupFundEventKind, "reversal">;
  actorUid: string;
  createdAtMs: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}
