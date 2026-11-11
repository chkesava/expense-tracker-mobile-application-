/**
 * SPENDLY-683 — every Group Funds write, as a pure plan (epic SPENDLY-678).
 *
 * A builder validates one user action against the fund as this device sees it
 * and returns a `GroupFundWritePlan`: the fund fields to write, the signed
 * total increments, how `version` moves, the append-only events, the
 * `accountEntries` rows and the balance legs. `groupFundWritePlanToOps` turns
 * the fund/event/entry part into `MutationOp[]`; the store (SPENDLY-684) adds
 * the account balance ops for `balanceLegs` through `journalBalanceOps`, and
 * commits everything as one `commitMutations` batch.
 *
 * Accounting (docs/SPENDLY-678-group-funds.md):
 *   - A contribution credits the receiving account; a payout debits the paying
 *     account. Each is one `accountEntries` row (source `group_fund_*`), so the
 *     real balance moves exactly once and the balance rebuild sees it.
 *   - Nothing here writes an expense, an income, a dashboard summary or a
 *     transfer document. Group money is never the user's income or spending.
 *   - Opening balances and purpose-to-purpose transfers move no account.
 *
 * Concurrency: money events write `increment()` for every total and
 * `version: increment(1)`, so two devices' contributions both apply. Config
 * edits write a literal `version: base + 1`, so a stale edit is rejected by
 * rules instead of overwriting the other device's change.
 *
 * Idempotency: the caller mints `ctx.eventId` once per user submit and reuses
 * it on retry. Every other id is derived from it (`gf_<eventId>`,
 * `<eventId>__in`, `rev_<eventId>`, `gf_rev_…`). Events are create-only in
 * rules, so a replayed batch fails as a whole instead of applying twice, and
 * the same event can only ever be reversed once.
 */

import type { AccountEntrySource } from "../types/expense";
import {
  GROUP_FUND_LIMITS,
  GROUP_FUND_SCHEMA_VERSION,
  type GroupFund,
  type GroupFundEvent,
  type GroupFundEventKind,
  type GroupFundMember,
  type GroupFundPurpose,
  type GroupFundStatus,
} from "../types/groupFund";
import type { MutationOp } from "../types/mutations";
import type { BalanceLeg } from "./ledgerAccountDeltas";
import {
  allocatePayoutDraw,
  groupFundEventEffect,
  reversedGroupFundEventIds,
  type GroupFundEffect,
} from "./groupFundMath";
import {
  cleanGroupFundText,
  emptyGroupFundTotals,
  findMember,
  findPurpose,
  groupFundStatus,
  isGroupFundStatus,
  isSafeKey,
  validateDate,
  validateFundName,
  validateGroupFundAmount,
  validateMembers,
  validateOptionalText,
  validatePeriod,
  validatePurposes,
  type GroupFundIssue,
} from "./groupFundModel";
import { roundMoney } from "./money";

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export type GroupFundWriteContext = {
  uid: string;
  nowMs: number;
  /** Minted once per user submit; reused on retry. */
  eventId: string;
};

export type GroupFundVersionMode =
  | { kind: "increment" }
  /** Literal next version — a stale edit is rejected by rules. */
  | { kind: "expect"; next: number };

export type GroupFundAccountEntry = {
  id: string;
  accountId: string;
  amount: number;
  direction: "credit" | "debit";
  date: string;
  note?: string;
  source: AccountEntrySource;
  linkedGroupFundId: string;
  linkedGroupFundEventId: string;
  reversalOf?: string;
  transferId?: string;
};

export type GroupFundWritePlan = {
  fundId: string;
  mode: "create" | "update";
  /** Plain values (no sentinels). Never contains totals on update. */
  fields: Record<string, unknown>;
  /** Field path → signed amount, applied as increment() on update. */
  increments: Record<string, number>;
  version: GroupFundVersionMode;
  events: GroupFundEvent[];
  accountEntries: GroupFundAccountEntry[];
  /** Signed, dated account balance changes, one per account entry. */
  balanceLegs: BalanceLeg[];
  nowMs: number;
};

export type GroupFundWriteResult =
  | { ok: true; plan: GroupFundWritePlan }
  | { ok: false; issues: GroupFundIssue[] };

const fail = (...issues: GroupFundIssue[]): GroupFundWriteResult => ({ ok: false, issues });

function stripUndefined<T extends object>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = v;
  return out as T;
}

function optionalText(value: string | undefined): string | undefined {
  const clean = cleanGroupFundText(value);
  return clean ? clean : undefined;
}

/** Field-path increments for one event's effect on its purpose. */
function effectIncrements(purposeId: string, effect: GroupFundEffect): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (path: string, delta: number) => {
    if (delta === 0) return;
    out[path] = roundMoney((out[path] ?? 0) + delta);
  };
  for (const [bucket, delta] of Object.entries(effect.buckets)) {
    add(`totals.${bucket}`, delta as number);
    add(`byPurpose.${purposeId}.${bucket}`, delta as number);
  }
  add("totals.held", effect.heldDelta);
  add(`byPurpose.${purposeId}.held`, effect.heldDelta);
  for (const [accountId, delta] of Object.entries(effect.accountDeltas)) add(`heldByAccount.${accountId}`, delta);
  return out;
}

function mergeIncrements(...parts: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of parts) {
    for (const [k, v] of Object.entries(part)) out[k] = roundMoney((out[k] ?? 0) + v);
  }
  for (const [k, v] of Object.entries(out)) if (v === 0) delete out[k];
  return out;
}

function purposeHeld(fund: GroupFund, purposeId: string): number {
  return fund.byPurpose?.[purposeId]?.held ?? 0;
}

function accountHeld(fund: GroupFund, accountId: string): number {
  return fund.heldByAccount?.[accountId] ?? 0;
}

/**
 * SPENDLY-752: the accounts a payout takes held money from, as this device
 * sees the fund (`allocatePayoutDraw`). Stored on the event so the fund's
 * increments, a rebuild and a later reversal all use the same split. Always
 * stored, even empty (no account holds anything for the fund): a payout
 * without `heldDraw` is read as a pre-752 one.
 */
function heldDrawFor(fund: GroupFund, accountId: string, amount: number): Record<string, number> {
  return allocatePayoutDraw(fund.heldByAccount, accountId, amount);
}

/**
 * A payout's reversal gives back exactly what the payout drew. A payout saved
 * before SPENDLY-752 has no draw; it took everything from its own account, so
 * its reversal gives everything back there (stated, so a rebuild agrees).
 */
function reversalHeldDraw(target: GroupFundEvent): Record<string, number> | undefined {
  if (target.kind !== "payout") return undefined;
  if (target.heldDraw) return { ...target.heldDraw };
  return target.accountId ? { [target.accountId]: target.amount } : undefined;
}

function moneyPlan(
  ctx: GroupFundWriteContext,
  fund: GroupFund,
  events: GroupFundEvent[],
  accountEntries: GroupFundAccountEntry[]
): GroupFundWritePlan {
  const increments = mergeIncrements(
    ...events.map((e) => effectIncrements(e.purposeId, groupFundEventEffect(e)))
  );
  const balanceLegs: BalanceLeg[] = accountEntries.map((entry) => ({
    accountId: entry.accountId,
    amountDelta: entry.direction === "credit" ? entry.amount : -entry.amount,
    date: entry.date,
  }));
  // Rules check that the linked event's purpose stays ≥ 0, so link the event
  // that takes money out of a purpose when there is one (a transfer's source).
  const linked = events.find((e) => groupFundEventEffect(e).heldDelta < 0) ?? events[events.length - 1];
  return {
    fundId: fund.id,
    mode: "update",
    fields: { lastEventId: linked.id },
    increments,
    version: { kind: "increment" },
    events,
    accountEntries,
    balanceLegs,
    nowMs: ctx.nowMs,
  };
}

function newEvent(
  ctx: GroupFundWriteContext,
  fundId: string,
  partial: Omit<GroupFundEvent, "fundId" | "actorUid" | "createdAtMs" | "id"> & { id?: string }
): GroupFundEvent {
  return stripUndefined({
    ...partial,
    id: partial.id ?? ctx.eventId,
    fundId,
    actorUid: ctx.uid,
    createdAtMs: ctx.nowMs,
  }) as GroupFundEvent;
}

/** Common checks for any event that moves money in a fund. */
function checkMoneyInput(
  fund: GroupFund,
  input: { purposeId: string; amount: number; date: string; note?: string },
  { allowArchivedPurpose = false } = {}
): GroupFundIssue[] {
  if (groupFundStatus(fund) === "archived") return ["fund_archived"];
  const purpose = findPurpose(fund, input.purposeId);
  if (!purpose) return ["purpose_unknown"];
  if (purpose.archived && !allowArchivedPurpose) return ["purpose_archived"];
  return [
    ...validateGroupFundAmount(input.amount),
    ...validateDate(input.date),
    ...validateOptionalText(input.note, GROUP_FUND_LIMITS.noteMax, "note_too_long"),
  ];
}

// ---------------------------------------------------------------------------
// Fund create / edit
// ---------------------------------------------------------------------------

export type GroupFundConfigInput = {
  name: string;
  notes?: string;
  /** SPENDLY-688: first month of collection (YYYY-MM). */
  startPeriod?: string;
  purposes: GroupFundPurpose[];
  members: GroupFundMember[];
};

function cleanPurposes(purposes: readonly GroupFundPurpose[]): GroupFundPurpose[] {
  return purposes.map((p) =>
    stripUndefined({
      id: p.id,
      name: cleanGroupFundText(p.name),
      cadence: p.cadence,
      expectedPerMember: p.expectedPerMember,
      target: p.target,
      archived: p.archived ? true : undefined,
    })
  );
}

function cleanMembers(members: readonly GroupFundMember[]): GroupFundMember[] {
  return members.map((m) =>
    stripUndefined({
      id: m.id,
      name: cleanGroupFundText(m.name),
      archived: m.archived ? true : undefined,
      joinedPeriod: m.joinedPeriod || undefined,
      leftPeriod: m.leftPeriod || undefined,
    })
  );
}

function validateConfig(input: GroupFundConfigInput): GroupFundIssue[] {
  return [
    ...validateFundName(input.name),
    ...validateOptionalText(input.notes, GROUP_FUND_LIMITS.notesMax, "notes_too_long"),
    ...validatePeriod(input.startPeriod),
    ...validatePurposes(input.purposes),
    ...validateMembers(input.members),
  ];
}

export function buildCreateGroupFund(
  ctx: GroupFundWriteContext,
  fundId: string,
  input: GroupFundConfigInput
): GroupFundWriteResult {
  if (!isSafeKey(fundId)) return fail("id_invalid");
  const issues = validateConfig(input);
  if (issues.length > 0) return { ok: false, issues };
  const fields = stripUndefined({
    name: cleanGroupFundText(input.name),
    notes: optionalText(input.notes),
    startPeriod: input.startPeriod || undefined,
    status: "active" as GroupFundStatus,
    purposes: cleanPurposes(input.purposes),
    members: cleanMembers(input.members),
    totals: emptyGroupFundTotals(),
    byPurpose: {},
    heldByAccount: {},
    schemaVersion: GROUP_FUND_SCHEMA_VERSION,
    version: 1,
    createdAtMs: ctx.nowMs,
  });
  return {
    ok: true,
    plan: {
      fundId,
      mode: "create",
      fields,
      increments: {},
      version: { kind: "expect", next: 1 },
      events: [],
      accountEntries: [],
      balanceLegs: [],
      nowMs: ctx.nowMs,
    },
  };
}

export type GroupFundEditPatch = Partial<GroupFundConfigInput> & { status?: GroupFundStatus };

/**
 * Edits name, notes, purposes, members or status. Purposes and members are
 * never removed — they are archived — because events keep pointing at them.
 */
export function buildEditGroupFund(
  ctx: GroupFundWriteContext,
  fund: GroupFund,
  patch: GroupFundEditPatch
): GroupFundWriteResult {
  const next: GroupFundConfigInput = {
    name: patch.name ?? fund.name,
    notes: patch.notes ?? fund.notes,
    startPeriod: patch.startPeriod ?? fund.startPeriod,
    purposes: patch.purposes ?? fund.purposes,
    members: patch.members ?? fund.members,
  };
  const issues = validateConfig(next);
  if (patch.status !== undefined && !isGroupFundStatus(patch.status)) issues.push("no_change");
  if (patch.purposes && fund.purposes.some((p) => !patch.purposes!.some((q) => q.id === p.id))) {
    issues.push("purpose_invalid");
  }
  if (patch.members && fund.members.some((m) => !patch.members!.some((q) => q.id === m.id))) {
    issues.push("member_invalid");
  }
  if (issues.length > 0) return { ok: false, issues };

  const fields: Record<string, unknown> = {};
  if (patch.name !== undefined && cleanGroupFundText(patch.name) !== fund.name) {
    fields.name = cleanGroupFundText(patch.name);
  }
  if (patch.notes !== undefined && cleanGroupFundText(patch.notes) !== (fund.notes ?? "")) {
    fields.notes = cleanGroupFundText(patch.notes);
  }
  if (patch.startPeriod !== undefined && patch.startPeriod !== (fund.startPeriod ?? "")) {
    fields.startPeriod = patch.startPeriod;
  }
  if (patch.purposes) {
    const cleaned = cleanPurposes(patch.purposes);
    if (JSON.stringify(cleaned) !== JSON.stringify(cleanPurposes(fund.purposes))) fields.purposes = cleaned;
  }
  if (patch.members) {
    const cleaned = cleanMembers(patch.members);
    if (JSON.stringify(cleaned) !== JSON.stringify(cleanMembers(fund.members))) fields.members = cleaned;
  }
  if (patch.status !== undefined && patch.status !== groupFundStatus(fund)) fields.status = patch.status;
  if (Object.keys(fields).length === 0) return fail("no_change");
  return {
    ok: true,
    plan: {
      fundId: fund.id,
      mode: "update",
      fields,
      increments: {},
      version: { kind: "expect", next: (fund.version ?? 0) + 1 },
      events: [],
      accountEntries: [],
      balanceLegs: [],
      nowMs: ctx.nowMs,
    },
  };
}

// ---------------------------------------------------------------------------
// Money events
// ---------------------------------------------------------------------------

export const groupFundEntryId = (eventId: string, suffix = "") => `gf_${eventId}${suffix}`;
export const groupFundReversalId = (eventId: string) => `rev_${eventId}`;
/** `gf_<x>` → `gf_rev_<x>`, so each original entry has exactly one possible reversal. */
export const groupFundReversalEntryId = (entryId: string) => `gf_rev_${entryId.replace(/^gf_/, "")}`;
export const groupFundTransferInId = (eventId: string) => `${eventId}__in`;

function entryNote(fund: GroupFund, purpose: GroupFundPurpose, who?: string): string {
  return who ? `${who} — ${fund.name} · ${purpose.name}` : `${fund.name} · ${purpose.name}`;
}

export type ContributionInput = {
  purposeId: string;
  memberId: string;
  amount: number;
  date: string;
  /** YYYY-MM the contribution counts for. Defaults to the date's month. */
  period?: string;
  accountId: string;
  note?: string;
};

export function buildContribution(
  ctx: GroupFundWriteContext,
  fund: GroupFund,
  input: ContributionInput
): GroupFundWriteResult {
  const issues = checkMoneyInput(fund, input);
  if (!input.memberId) issues.push("member_required");
  else {
    const member = findMember(fund, input.memberId);
    if (!member) issues.push("member_unknown");
    else if (member.archived) issues.push("member_archived");
  }
  if (!isSafeKey(input.accountId)) issues.push("account_required");
  issues.push(...validatePeriod(input.period));
  if (issues.length > 0) return { ok: false, issues };

  const purpose = findPurpose(fund, input.purposeId)!;
  const member = findMember(fund, input.memberId)!;
  const amount = roundMoney(input.amount);
  const entry: GroupFundAccountEntry = stripUndefined({
    id: groupFundEntryId(ctx.eventId),
    accountId: input.accountId,
    amount,
    direction: "credit" as const,
    date: input.date,
    note: entryNote(fund, purpose, member.name),
    source: "group_fund_contribution" as const,
    linkedGroupFundId: fund.id,
    linkedGroupFundEventId: ctx.eventId,
  });
  const event = newEvent(ctx, fund.id, {
    kind: "contribution",
    amount,
    purposeId: purpose.id,
    memberId: member.id,
    date: input.date,
    period: input.period ?? input.date.slice(0, 7),
    accountId: input.accountId,
    accountEntryIds: [entry.id],
    note: optionalText(input.note),
  });
  return { ok: true, plan: moneyPlan(ctx, fund, [event], [entry]) };
}

export type PayoutInput = {
  purposeId: string;
  amount: number;
  date: string;
  accountId: string;
  recipient?: string;
  reference?: string;
  note?: string;
};

export function buildPayout(ctx: GroupFundWriteContext, fund: GroupFund, input: PayoutInput): GroupFundWriteResult {
  const issues = checkMoneyInput(fund, input, { allowArchivedPurpose: true });
  if (!isSafeKey(input.accountId)) issues.push("account_required");
  issues.push(
    ...validateOptionalText(input.recipient, GROUP_FUND_LIMITS.recipientMax, "recipient_too_long"),
    ...validateOptionalText(input.reference, GROUP_FUND_LIMITS.referenceMax, "reference_too_long")
  );
  if (issues.length === 0 && roundMoney(input.amount) > purposeHeld(fund, input.purposeId) + 0.005) {
    issues.push("exceeds_held");
  }
  if (issues.length > 0) return { ok: false, issues };

  const purpose = findPurpose(fund, input.purposeId)!;
  const amount = roundMoney(input.amount);
  const recipient = optionalText(input.recipient);
  const entry: GroupFundAccountEntry = stripUndefined({
    id: groupFundEntryId(ctx.eventId),
    accountId: input.accountId,
    amount,
    direction: "debit" as const,
    date: input.date,
    note: recipient ? `Paid to ${recipient} — ${fund.name} · ${purpose.name}` : entryNote(fund, purpose),
    source: "group_fund_payout" as const,
    linkedGroupFundId: fund.id,
    linkedGroupFundEventId: ctx.eventId,
  });
  const event = newEvent(ctx, fund.id, {
    kind: "payout",
    amount,
    purposeId: purpose.id,
    date: input.date,
    accountId: input.accountId,
    heldDraw: heldDrawFor(fund, input.accountId, amount),
    accountEntryIds: [entry.id],
    recipient,
    reference: optionalText(input.reference),
    note: optionalText(input.note),
  });
  return { ok: true, plan: moneyPlan(ctx, fund, [event], [entry]) };
}

export type OpeningInput = {
  purposeId: string;
  amount: number;
  date: string;
  /** Where the money sits today. Attribution only — no account is credited. */
  accountId?: string;
  note?: string;
};

/**
 * Money already held before tracking started. It is already inside the
 * account's balance, so no account entry is written; it only enters the fund's
 * totals (and therefore the net worth "held for others" amount).
 */
export function buildOpening(ctx: GroupFundWriteContext, fund: GroupFund, input: OpeningInput): GroupFundWriteResult {
  const issues = checkMoneyInput(fund, input);
  if (input.accountId !== undefined && !isSafeKey(input.accountId)) issues.push("account_required");
  if (issues.length > 0) return { ok: false, issues };
  const event = newEvent(ctx, fund.id, {
    kind: "opening",
    amount: roundMoney(input.amount),
    purposeId: input.purposeId,
    date: input.date,
    accountId: input.accountId,
    note: optionalText(input.note),
  });
  return { ok: true, plan: moneyPlan(ctx, fund, [event], []) };
}

export type PurposeTransferInput = {
  fromPurposeId: string;
  toPurposeId: string;
  amount: number;
  date: string;
  note?: string;
};

/** Moves held money between two purposes of one fund. The fund's held total is unchanged. */
export function buildPurposeTransfer(
  ctx: GroupFundWriteContext,
  fund: GroupFund,
  input: PurposeTransferInput
): GroupFundWriteResult {
  const issues = checkMoneyInput(fund, { ...input, purposeId: input.fromPurposeId }, { allowArchivedPurpose: true });
  const to = findPurpose(fund, input.toPurposeId);
  if (!to) issues.push("purpose_unknown");
  else if (to.archived) issues.push("purpose_archived");
  if (input.fromPurposeId === input.toPurposeId) issues.push("purposes_same");
  if (issues.length === 0 && roundMoney(input.amount) > purposeHeld(fund, input.fromPurposeId) + 0.005) {
    issues.push("exceeds_held");
  }
  if (issues.length > 0) return { ok: false, issues };
  const amount = roundMoney(input.amount);
  const note = optionalText(input.note);
  const out = newEvent(ctx, fund.id, {
    kind: "transfer_out",
    amount,
    purposeId: input.fromPurposeId,
    date: input.date,
    transferPairId: ctx.eventId,
    note,
  });
  const inn = newEvent(ctx, fund.id, {
    id: groupFundTransferInId(ctx.eventId),
    kind: "transfer_in",
    amount,
    purposeId: input.toPurposeId,
    date: input.date,
    transferPairId: ctx.eventId,
    note,
  });
  return { ok: true, plan: moneyPlan(ctx, fund, [out, inn], []) };
}

export type AccountMoveInput = {
  purposeId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  note?: string;
};

/**
 * Held money moved between two of the user's own accounts (e.g. cash
 * deposited into the bank). Debits one, credits the other, both rows sharing
 * a `transferId`, so account screens show a transfer. The fund's held total
 * is unchanged; only `heldByAccount` moves.
 */
export function buildAccountMove(
  ctx: GroupFundWriteContext,
  fund: GroupFund,
  input: AccountMoveInput
): GroupFundWriteResult {
  const issues = checkMoneyInput(fund, input, { allowArchivedPurpose: true });
  if (!isSafeKey(input.fromAccountId) || !isSafeKey(input.toAccountId)) issues.push("account_required");
  else if (input.fromAccountId === input.toAccountId) issues.push("accounts_same");
  if (issues.length === 0 && roundMoney(input.amount) > accountHeld(fund, input.fromAccountId) + 0.005) {
    issues.push("exceeds_account_held");
  }
  if (issues.length > 0) return { ok: false, issues };
  const purpose = findPurpose(fund, input.purposeId)!;
  const amount = roundMoney(input.amount);
  const base = {
    amount,
    date: input.date,
    note: entryNote(fund, purpose),
    source: "group_fund_move" as const,
    linkedGroupFundId: fund.id,
    linkedGroupFundEventId: ctx.eventId,
    transferId: ctx.eventId,
  };
  const out: GroupFundAccountEntry = {
    ...base,
    id: groupFundEntryId(ctx.eventId, "_out"),
    accountId: input.fromAccountId,
    direction: "debit",
  };
  const inn: GroupFundAccountEntry = {
    ...base,
    id: groupFundEntryId(ctx.eventId, "_in"),
    accountId: input.toAccountId,
    direction: "credit",
  };
  const event = newEvent(ctx, fund.id, {
    kind: "account_move",
    amount,
    purposeId: purpose.id,
    date: input.date,
    accountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    accountEntryIds: [out.id, inn.id],
    note: optionalText(input.note),
  });
  return { ok: true, plan: moneyPlan(ctx, fund, [event], [out, inn]) };
}

// ---------------------------------------------------------------------------
// SPENDLY-700: manual backfill of past months (no cron)
// ---------------------------------------------------------------------------

/**
 * The fixed id of a member's backfilled payment for one purpose and month.
 * Events are create-only, so the same month can't be backfilled twice for
 * them, from any device or a double tap.
 *
 * Parts are joined with "~", which no fund, purpose or member id can contain
 * (`isSafeKey`: letters, digits, "_" and "-"), so two different members'
 * months can never produce the same id. (Nothing used the earlier "_" form:
 * it never shipped.)
 */
export const groupFundBackfillId = (fundId: string, period: string, purposeId: string, memberId: string) =>
  `bf~${fundId}~${period}~${purposeId}~${memberId}`;

export type BackfillContributionInput = {
  purposeId: string;
  memberId: string;
  /** The month it counts for (YYYY-MM). */
  period: string;
  amount: number;
  /**
   * `true` (the default for past months): the money is already in the
   * account balance, so no account entry is written and no balance changes.
   * `false`: it hasn't reached the account yet; `accountId` is credited once.
   */
  alreadyInBalance: boolean;
  /** Where the money sits (attribution) or, when not yet in the balance, the account credited. */
  accountId?: string;
  /** Date the money arrived when it moves an account now; defaults to the month's first day. */
  date?: string;
  note?: string;
};

/**
 * A past month's contribution. Archived members and purposes are allowed:
 * the member may have left since. Uses the fixed backfill id, not
 * `ctx.eventId`.
 */
export function buildBackfillContribution(
  ctx: GroupFundWriteContext,
  fund: GroupFund,
  input: BackfillContributionInput
): GroupFundWriteResult {
  const issues: GroupFundIssue[] = [];
  if (groupFundStatus(fund) === "archived") issues.push("fund_archived");
  if (!findPurpose(fund, input.purposeId)) issues.push("purpose_unknown");
  if (!input.memberId) issues.push("member_required");
  else if (!findMember(fund, input.memberId)) issues.push("member_unknown");
  issues.push(...validateGroupFundAmount(input.amount), ...validatePeriod(input.period));
  if (!input.period) issues.push("period_invalid");
  const date = input.date ?? `${input.period}-01`;
  issues.push(...validateDate(date));
  issues.push(...validateOptionalText(input.note, GROUP_FUND_LIMITS.noteMax, "note_too_long"));
  if (!input.alreadyInBalance && !isSafeKey(input.accountId)) issues.push("account_required");
  if (input.alreadyInBalance && input.accountId !== undefined && !isSafeKey(input.accountId)) issues.push("account_required");
  if (issues.length > 0) return { ok: false, issues };

  const purpose = findPurpose(fund, input.purposeId)!;
  const member = findMember(fund, input.memberId)!;
  const amount = roundMoney(input.amount);
  const eventId = groupFundBackfillId(fund.id, input.period, purpose.id, member.id);
  const entries: GroupFundAccountEntry[] = input.alreadyInBalance
    ? []
    : [
        stripUndefined({
          id: groupFundEntryId(eventId),
          accountId: input.accountId!,
          amount,
          direction: "credit" as const,
          date,
          note: entryNote(fund, purpose, member.name),
          source: "group_fund_contribution" as const,
          linkedGroupFundId: fund.id,
          linkedGroupFundEventId: eventId,
        }),
      ];
  const event = newEvent({ ...ctx, eventId }, fund.id, {
    kind: "contribution",
    amount,
    purposeId: purpose.id,
    memberId: member.id,
    date,
    period: input.period,
    accountId: input.accountId,
    accountEntryIds: entries.length > 0 ? entries.map((e) => e.id) : undefined,
    attributionOnly: input.alreadyInBalance ? true : undefined,
    note: optionalText(input.note),
  });
  return { ok: true, plan: moneyPlan({ ...ctx, eventId }, fund, [event], entries) };
}

export type PastPayoutInput = {
  purposeId: string;
  amount: number;
  date: string;
  /** Where it was paid from: attribution only, nothing is debited again. */
  accountId?: string;
  recipient?: string;
  reference?: string;
  note?: string;
};

/**
 * A payout made before it was tracked here: the money already left the
 * account, so no account entry is written. It lowers the fund's held total
 * (and, when `accountId` is set, what the fund holds in that account).
 */
export function buildPastPayout(ctx: GroupFundWriteContext, fund: GroupFund, input: PastPayoutInput): GroupFundWriteResult {
  const issues = checkMoneyInput(fund, input, { allowArchivedPurpose: true });
  if (input.accountId !== undefined && !isSafeKey(input.accountId)) issues.push("account_required");
  issues.push(
    ...validateOptionalText(input.recipient, GROUP_FUND_LIMITS.recipientMax, "recipient_too_long"),
    ...validateOptionalText(input.reference, GROUP_FUND_LIMITS.referenceMax, "reference_too_long")
  );
  if (issues.length === 0 && roundMoney(input.amount) > purposeHeld(fund, input.purposeId) + 0.005) {
    issues.push("exceeds_held");
  }
  if (issues.length > 0) return { ok: false, issues };
  const amount = roundMoney(input.amount);
  const event = newEvent(ctx, fund.id, {
    kind: "payout",
    amount,
    purposeId: input.purposeId,
    date: input.date,
    accountId: input.accountId,
    heldDraw: input.accountId ? heldDrawFor(fund, input.accountId, amount) : undefined,
    attributionOnly: true,
    recipient: optionalText(input.recipient),
    reference: optionalText(input.reference),
    note: optionalText(input.note),
  });
  return { ok: true, plan: moneyPlan(ctx, fund, [event], []) };
}

// ---------------------------------------------------------------------------
// Reversal
// ---------------------------------------------------------------------------

export type ReversalInput = {
  /** The event to undo. For a purpose transfer, either half undoes both. */
  target: GroupFundEvent;
  /** Every event of this fund this device knows, to find the transfer pair and earlier reversals. */
  knownEvents: readonly GroupFundEvent[];
  /** Local date of the correction; the account legs are dated with it. */
  date: string;
  note?: string;
};

function reversalOf(
  ctx: GroupFundWriteContext,
  fund: GroupFund,
  target: GroupFundEvent,
  date: string,
  note: string | undefined
): { event: GroupFundEvent; entries: GroupFundAccountEntry[] } {
  const kind = target.kind as Exclude<GroupFundEventKind, "reversal">;
  const id = groupFundReversalId(target.id);
  const entries: GroupFundAccountEntry[] = [];
  for (const originalId of target.accountEntryIds ?? []) {
    const isMoveIn = kind === "account_move" && originalId.endsWith("_in");
    const accountId = isMoveIn ? target.toAccountId : target.accountId;
    if (!accountId) continue;
    // The original credited (contribution, move-in) or debited (payout, move-out); undo it.
    const originalCredit = kind === "contribution" || isMoveIn;
    entries.push(
      stripUndefined({
        id: groupFundReversalEntryId(originalId),
        accountId,
        amount: target.amount,
        direction: originalCredit ? ("debit" as const) : ("credit" as const),
        date,
        note: `Correction — ${fund.name}`,
        source: "group_fund_reversal" as const,
        linkedGroupFundId: fund.id,
        linkedGroupFundEventId: id,
        reversalOf: originalId,
        transferId: kind === "account_move" ? id : undefined,
      })
    );
  }
  const event = newEvent(ctx, fund.id, {
    id,
    kind: "reversal",
    reversalOf: target.id,
    reversedKind: kind,
    amount: target.amount,
    purposeId: target.purposeId,
    memberId: target.memberId,
    period: target.period,
    date,
    accountId: target.accountId,
    toAccountId: target.toAccountId,
    heldDraw: reversalHeldDraw(target),
    accountEntryIds: entries.length > 0 ? entries.map((e) => e.id) : undefined,
    transferPairId: target.transferPairId,
    note,
  });
  return { event, entries };
}

/**
 * Undoes one event with an explicit, auditable reversal. The original is
 * never changed or deleted. Refused when the undo would leave a purpose (or,
 * for an account move, an account) holding less than nothing — for example
 * reversing a contribution whose money has already been paid out.
 */
export function buildReversal(
  ctx: GroupFundWriteContext,
  fund: GroupFund,
  input: ReversalInput
): GroupFundWriteResult {
  const { target } = input;
  const issues: GroupFundIssue[] = [];
  if (groupFundStatus(fund) === "archived") issues.push("fund_archived");
  if (target.fundId !== fund.id || target.kind === "reversal") issues.push("reversal_not_allowed");
  issues.push(...validateDate(input.date));
  issues.push(...validateOptionalText(input.note, GROUP_FUND_LIMITS.noteMax, "note_too_long"));
  if (issues.length > 0) return { ok: false, issues };

  let targets: GroupFundEvent[] = [target];
  if (target.kind === "transfer_in" || target.kind === "transfer_out") {
    const pair = input.knownEvents.find(
      (e) => e.id !== target.id && e.transferPairId === target.transferPairId && e.kind !== "reversal"
    );
    if (!pair) return fail("reversal_not_allowed");
    targets = target.kind === "transfer_out" ? [target, pair] : [pair, target];
  }
  const reversed = reversedGroupFundEventIds(input.knownEvents);
  if (targets.some((t) => reversed.has(t.id))) return fail("already_reversed");

  const note = optionalText(input.note);
  const parts = targets.map((t) => reversalOf(ctx, fund, t, input.date, note));
  const events = parts.map((p) => p.event);
  const entries = parts.flatMap((p) => p.entries);
  const plan = moneyPlan(ctx, fund, events, entries);

  // Nothing may go below zero after the undo, as this device sees the fund.
  for (const [path, delta] of Object.entries(plan.increments)) {
    if (delta >= 0) continue;
    const isHeld = path.endsWith(".held") || path.startsWith("heldByAccount.");
    if (!isHeld) continue;
    const current = readPath(fund, path);
    if (roundMoney(current + delta) < -0.005) {
      return fail(path.startsWith("heldByAccount.") ? "exceeds_account_held" : "exceeds_held");
    }
  }
  return { ok: true, plan };
}

function readPath(fund: GroupFund, path: string): number {
  let cursor: unknown = fund;
  for (const part of path.split(".")) {
    if (cursor === null || typeof cursor !== "object") return 0;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return typeof cursor === "number" ? cursor : 0;
}

// ---------------------------------------------------------------------------
// Plan → outbox ops
// ---------------------------------------------------------------------------

/** Firestore field-value factories, injected so this module stays SDK-free. */
export type GroupFundSentinels = {
  serverTimestamp: () => unknown;
  increment: (n: number) => unknown;
};

export const groupFundPath = (uid: string, fundId: string) => `users/${uid}/groupFunds/${fundId}`;
export const groupFundEventPath = (uid: string, eventId: string) => `users/${uid}/groupFundEvents/${eventId}`;
export const groupFundAccountEntryPath = (uid: string, entryId: string) => `users/${uid}/accountEntries/${entryId}`;

/**
 * The fund, its events and its account entries, as one batch. Stamps
 * createdAt / updatedAt with server timestamps (READ_MODEL_RULES R1.2). The
 * account balance ops for `plan.balanceLegs` are added by the caller.
 */
export function groupFundWritePlanToOps(
  uid: string,
  plan: GroupFundWritePlan,
  s: GroupFundSentinels
): MutationOp[] {
  const ops: MutationOp[] = [];
  if (plan.mode === "create") {
    ops.push({
      op: "set",
      ref: { path: groupFundPath(uid, plan.fundId) },
      data: { ...plan.fields, createdAt: s.serverTimestamp(), updatedAt: s.serverTimestamp() },
    });
  } else {
    const data: Record<string, unknown> = { ...plan.fields, updatedAt: s.serverTimestamp() };
    for (const [path, delta] of Object.entries(plan.increments)) data[path] = s.increment(delta);
    data.version = plan.version.kind === "increment" ? s.increment(1) : plan.version.next;
    ops.push({ op: "update", ref: { path: groupFundPath(uid, plan.fundId) }, data });
  }
  for (const e of plan.events) {
    const { id, ...rest } = e;
    ops.push({
      op: "set",
      ref: { path: groupFundEventPath(uid, id) },
      data: { ...stripUndefined(rest), createdAt: s.serverTimestamp(), updatedAt: s.serverTimestamp() },
    });
  }
  for (const entry of plan.accountEntries) {
    const { id, ...rest } = entry;
    ops.push({
      op: "set",
      ref: { path: groupFundAccountEntryPath(uid, id) },
      data: { ...stripUndefined(rest), createdAt: s.serverTimestamp(), updatedAt: s.serverTimestamp() },
    });
  }
  return ops;
}
