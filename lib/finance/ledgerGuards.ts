/**
 * Pure helpers for FinanceData pending-sync aggregation and mutation guards.
 * Kept free of Firebase so Vitest can cover them without an emulator.
 */

import { isValidDateKey } from "@/shared/utils/dates";

export function totalPendingSyncCount(counts: readonly number[]): number {
  return counts.reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
}

export type PaymentValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/** Shared validation for account↔account bill payments and transfers. */
export function validateAccountMoneyMove(input: {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
}): PaymentValidationResult {
  const { fromAccountId, toAccountId, amount, date } = input;
  if (!fromAccountId || !toAccountId) {
    return { ok: false, error: "Source and destination accounts are required" };
  }
  if (fromAccountId === toAccountId) {
    return { ok: false, error: "Source and destination accounts must differ" };
  }
  if (!(amount > 0)) {
    return { ok: false, error: "Amount must be greater than zero" };
  }
  if (!isValidDateKey(date)) {
    return { ok: false, error: "Invalid payment date" };
  }
  return { ok: true };
}

export function countLinkedAccountRecords(sizes: readonly number[]): number {
  return sizes.reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
}

export function canDeleteAccount(linkedCount: number): boolean {
  return linkedCount <= 0;
}
