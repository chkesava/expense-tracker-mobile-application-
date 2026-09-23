import type { LedgerEventSnapshot } from "../types/ledgerEvent";

type SoftDeletable = { deletedAt?: unknown };

/**
 * Live journal rows have no `deletedAt`. Any set value (ISO string, Timestamp)
 * is a soft-delete and must be ignored by balances, lists, and derived spend.
 */
export function isActiveLedgerRow(
  row: SoftDeletable | null | undefined
): boolean {
  if (!row) return false;
  const deletedAt = row.deletedAt;
  if (deletedAt == null) return true;
  if (typeof deletedAt === "string") return deletedAt.trim() === "";
  return false;
}

export function activeLedgerRows<T extends SoftDeletable>(rows: readonly T[]): T[] {
  return rows.filter(isActiveLedgerRow);
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );
  return tags.length > 0 ? tags : undefined;
}

function numberOrZero(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

/** Primitive before/after image for `ledgerEvents`. Drops Timestamps. */
export function ledgerEventSnapshot(
  row: Record<string, unknown>
): LedgerEventSnapshot {
  const snapshot: LedgerEventSnapshot = {
    amount: numberOrZero(row.amount),
    date: typeof row.date === "string" ? row.date : "",
    month: typeof row.month === "string" ? row.month : "",
    accountId: optionalNullableString(row.accountId) ?? null,
    note: typeof row.note === "string" ? row.note : "",
  };
  const category = optionalString(row.category);
  if (category) snapshot.category = category;
  const subcategory = optionalString(row.subcategory);
  if (subcategory) snapshot.subcategory = subcategory;
  const source = optionalString(row.source);
  if (source) snapshot.source = source;
  const tags = optionalStringArray(row.tags);
  if (tags) snapshot.tags = tags;
  if ("spaceId" in row) {
    snapshot.spaceId = optionalNullableString(row.spaceId) ?? null;
  }
  if ("tripId" in row) {
    snapshot.tripId = optionalNullableString(row.tripId) ?? null;
  }
  const splitId = optionalString(row.splitId);
  if (splitId) snapshot.splitId = splitId;
  const subscriptionId = optionalString(row.subscriptionId);
  if (subscriptionId) snapshot.subscriptionId = subscriptionId;
  const smsFingerprint = optionalString(row.smsFingerprint);
  if (smsFingerprint) snapshot.smsFingerprint = smsFingerprint;
  const smsExternalRef = optionalString(row.smsExternalRef);
  if (smsExternalRef) snapshot.smsExternalRef = smsExternalRef;
  return snapshot;
}

export const SPLIT_OWNED_LEDGER_MESSAGE =
  "This expense belongs to a split. Open the split to change it.";

export const PAST_MONTH_LOCKED_MESSAGE = "Past months are locked in settings";

export const ALREADY_REMOVED_LEDGER_MESSAGE =
  "This transaction was already removed";

/** SPENDLY-110 — restoring a row that was never deleted. */
export const NOT_REMOVED_LEDGER_MESSAGE =
  "This transaction is already in your ledger";
