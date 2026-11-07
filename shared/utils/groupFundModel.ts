/**
 * SPENDLY-683 — Group Funds validation and small helpers (epic SPENDLY-678).
 * Pure: no React Native, no Firestore.
 */

import type { AccountEntrySource } from "../types/expense";
import {
  GROUP_FUND_CADENCES,
  GROUP_FUND_EVENT_KINDS,
  GROUP_FUND_LIMITS,
  GROUP_FUND_STATUSES,
  type GroupFund,
  type GroupFundCadence,
  type GroupFundEventKind,
  type GroupFundMember,
  type GroupFundPurpose,
  type GroupFundStatus,
  type GroupFundTotals,
} from "../types/groupFund";
import { isValidDateKey, isValidMonthKey } from "./dates";
import { parseGoalAmount, validatePositiveAmount } from "./goalModel";

export type GroupFundIssue =
  | "name_required"
  | "name_too_long"
  | "notes_too_long"
  | "note_too_long"
  | "recipient_too_long"
  | "reference_too_long"
  | "amount_invalid"
  | "amount_not_positive"
  | "amount_too_large"
  | "amount_too_precise"
  | "date_invalid"
  | "period_invalid"
  | "id_invalid"
  | "purposes_required"
  | "too_many_purposes"
  | "too_many_members"
  | "purpose_invalid"
  | "purpose_duplicate"
  | "purpose_unknown"
  | "purpose_archived"
  | "member_invalid"
  | "member_duplicate"
  | "member_unknown"
  | "member_archived"
  | "member_required"
  | "member_months_invalid"
  | "account_required"
  /** The account is a credit card or no longer exists; group money sits in cash or a bank. */
  | "account_unsupported"
  | "accounts_same"
  | "purposes_same"
  | "fund_archived"
  | "exceeds_held"
  | "exceeds_account_held"
  | "reversal_not_allowed"
  | "already_reversed"
  | "no_change";

/** Parse a typed amount ("6,000", "₹ 100.50") into a number, or NaN. */
export const parseGroupFundAmount = parseGoalAmount;

/** A positive amount, finite, two decimals at most, below the rules' bound. */
export function validateGroupFundAmount(value: unknown): GroupFundIssue[] {
  return validatePositiveAmount(value) as GroupFundIssue[];
}

export function cleanGroupFundText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function validateFundName(name: string): GroupFundIssue[] {
  const clean = cleanGroupFundText(name);
  if (!clean) return ["name_required"];
  if (clean.length > GROUP_FUND_LIMITS.nameMax) return ["name_too_long"];
  return [];
}

/**
 * Ids are used as map keys in field paths (`byPurpose.<id>.held`,
 * `heldByAccount.<id>`), so they must not contain dots, slashes or
 * backticks, and must not be empty.
 */
export function isSafeKey(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

export function validateDate(date: string): GroupFundIssue[] {
  return isValidDateKey(date) ? [] : ["date_invalid"];
}

export function validatePeriod(period: string | undefined): GroupFundIssue[] {
  if (period === undefined) return [];
  return isValidMonthKey(period) ? [] : ["period_invalid"];
}

export function validateOptionalText(
  value: string | undefined,
  max: number,
  issue: GroupFundIssue
): GroupFundIssue[] {
  return cleanGroupFundText(value).length > max ? [issue] : [];
}

function normalizedName(name: string): string {
  return cleanGroupFundText(name).toLocaleLowerCase();
}

export function validatePurposes(purposes: readonly GroupFundPurpose[]): GroupFundIssue[] {
  if (purposes.filter((p) => !p.archived).length === 0) return ["purposes_required"];
  if (purposes.length > GROUP_FUND_LIMITS.maxPurposes) return ["too_many_purposes"];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const p of purposes) {
    if (!isSafeKey(p.id)) return ["purpose_invalid"];
    if (validateFundName(p.name).length > 0) return ["purpose_invalid"];
    if (!isGroupFundCadence(p.cadence)) return ["purpose_invalid"];
    if (p.expectedPerMember !== undefined && validateGroupFundAmount(p.expectedPerMember).length > 0) {
      return ["purpose_invalid"];
    }
    if (p.target !== undefined && validateGroupFundAmount(p.target).length > 0) return ["purpose_invalid"];
    const key = normalizedName(p.name);
    if (ids.has(p.id) || names.has(key)) return ["purpose_duplicate"];
    ids.add(p.id);
    names.add(key);
  }
  return [];
}

export function validateMembers(members: readonly GroupFundMember[]): GroupFundIssue[] {
  if (members.length > GROUP_FUND_LIMITS.maxMembers) return ["too_many_members"];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const m of members) {
    if (!isSafeKey(m.id)) return ["member_invalid"];
    if (validateFundName(m.name).length > 0) return ["member_invalid"];
    if (validatePeriod(m.joinedPeriod).length > 0 || validatePeriod(m.leftPeriod).length > 0) return ["period_invalid"];
    if (m.joinedPeriod && m.leftPeriod && m.leftPeriod <= m.joinedPeriod) return ["member_months_invalid"];
    const key = normalizedName(m.name);
    if (ids.has(m.id) || names.has(key)) return ["member_duplicate"];
    ids.add(m.id);
    names.add(key);
  }
  return [];
}

export function isGroupFundStatus(value: unknown): value is GroupFundStatus {
  return typeof value === "string" && (GROUP_FUND_STATUSES as readonly string[]).includes(value);
}

export function isGroupFundCadence(value: unknown): value is GroupFundCadence {
  return typeof value === "string" && (GROUP_FUND_CADENCES as readonly string[]).includes(value);
}

export function isGroupFundEventKind(value: unknown): value is GroupFundEventKind {
  return typeof value === "string" && (GROUP_FUND_EVENT_KINDS as readonly string[]).includes(value);
}

const GROUP_FUND_ENTRY_SOURCES: readonly string[] = [
  "group_fund_contribution",
  "group_fund_payout",
  "group_fund_move",
  "group_fund_reversal",
] satisfies AccountEntrySource[];

/** True for an `accountEntries` row posted by Group Funds (money held for others). */
export function isGroupFundEntrySource(source: unknown): boolean {
  return typeof source === "string" && GROUP_FUND_ENTRY_SOURCES.includes(source);
}

/**
 * SPENDLY-688: the first month a fund collects for. Older funds have no
 * `startPeriod`; they start in the month they were created (local time).
 */
export function fundStartPeriod(fund: Pick<GroupFund, "startPeriod" | "createdAtMs">): string | null {
  if (fund.startPeriod) return fund.startPeriod;
  if (typeof fund.createdAtMs !== "number") return null;
  const d = new Date(fund.createdAtMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** SPENDLY-688: does this member owe for `period`? (joined on or before it, and hasn't left). */
export function memberOwesIn(member: GroupFundMember, period: string): boolean {
  if (member.joinedPeriod && period < member.joinedPeriod) return false;
  if (member.leftPeriod) return period < member.leftPeriod;
  // Archived before join/leave months existed: no longer owes anything.
  return !member.archived;
}

export function groupFundStatus(fund: Pick<GroupFund, "status">): GroupFundStatus {
  return fund.status ?? "active";
}

export function findPurpose(fund: Pick<GroupFund, "purposes">, purposeId: string): GroupFundPurpose | undefined {
  return fund.purposes.find((p) => p.id === purposeId);
}

export function findMember(fund: Pick<GroupFund, "members">, memberId: string): GroupFundMember | undefined {
  return fund.members.find((m) => m.id === memberId);
}

export function emptyGroupFundTotals(): GroupFundTotals {
  return { opening: 0, contributions: 0, payouts: 0, transfersIn: 0, transfersOut: 0, held: 0 };
}
