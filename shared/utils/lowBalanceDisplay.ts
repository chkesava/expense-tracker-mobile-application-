/**
 * SPENDLY-798 (epic SPENDLY-793): what the app shows from the stored
 * low-balance result (`serverResults/autoDebitShortfall`, written by
 * autodebit-daily). Display only (epic 735 rule): every figure is the server's
 * stored `shortBy` / `amount`. This file only picks which stored items still
 * apply on the user's `today`.
 *
 * - An item shows from `dueDate − leadDays` through `dueDate`. The window is
 *   checked against the viewer's day, so yesterday's run still reads right
 *   before this morning's run lands.
 * - A result more than a day old is treated as missing, so nothing stale shows.
 * - An account whose balance needs reconciliation shows a "can't check" note
 *   instead of a figure.
 *
 * Pure.
 */

import type { ShortfallItem } from "./autoDebitShortfall";
import { billUrl } from "./billReminderCopy";
import { shiftDateKey } from "./dates";
import { recurringHref } from "./recurringDetail";
import type { StoredAutoDebitShortfall } from "./serverResults";

/** Where a low-balance alert leads: the recurring item, or the card's bill. Shared by the push and the app. */
export function lowBalanceUrl(d: Pick<ShortfallItem, "kind" | "refId" | "billId">): string {
  if (d.kind === "card") return d.billId ? billUrl(d.billId) : "/credit-card-bills";
  return recurringHref(d.refId);
}

export type LowBalanceShort = ShortfallItem & { accountName: string; shortBy: number };
export type LowBalanceUnverified = ShortfallItem & { accountName: string };

export type LowBalanceView = {
  /** Debits the paying account can't cover, largest shortfall first. */
  short: LowBalanceShort[];
  /** Debits on an account whose balance can't be trusted right now. */
  unverified: LowBalanceUnverified[];
};

export const EMPTY_LOW_BALANCE_VIEW: LowBalanceView = { short: [], unverified: [] };

function inWindow(item: ShortfallItem, today: string): boolean {
  return item.dueDate >= today && today >= shiftDateKey(item.dueDate, -item.leadDays);
}

export function lowBalanceView(stored: StoredAutoDebitShortfall | null, today: string): LowBalanceView {
  if (!stored || stored.today < shiftDateKey(today, -1)) return EMPTY_LOW_BALANCE_VIEW;
  const short: LowBalanceShort[] = [];
  const unverified: LowBalanceUnverified[] = [];
  for (const account of stored.accounts ?? []) {
    for (const item of account.items ?? []) {
      if (!inWindow(item, today)) continue;
      if (!account.trusted) unverified.push({ ...item, accountName: account.accountName });
      else if (typeof item.shortBy === "number" && item.shortBy > 0) short.push({ ...item, accountName: account.accountName, shortBy: item.shortBy });
    }
  }
  short.sort((a, b) => b.shortBy - a.shortBy || a.dueDate.localeCompare(b.dueDate));
  return { short, unverified };
}

/** The view's entries for one recurring item. */
export function lowBalanceForSubscription(view: LowBalanceView, subscriptionId: string | undefined) {
  const match = (i: ShortfallItem) => i.kind === "subscription" && i.refId === subscriptionId;
  return { short: view.short.filter(match), unverified: view.unverified.filter(match) };
}

/** The view's entries for one card's autopay. */
export function lowBalanceForCard(view: LowBalanceView, cardId: string | undefined) {
  const match = (i: ShortfallItem) => i.kind === "card" && i.refId === cardId;
  return { short: view.short.filter(match), unverified: view.unverified.filter(match) };
}

/** The view's entries paid from one bank account. */
export function lowBalanceForPayingAccount(view: LowBalanceView, accountId: string | undefined) {
  const match = (i: ShortfallItem) => i.accountId === accountId;
  return { short: view.short.filter(match), unverified: view.unverified.filter(match) };
}

/** "today", "tomorrow" or "22 Nov". */
export function lowBalanceDueLabel(dueDate: string, today: string): string {
  if (dueDate === today) return "today";
  if (dueDate === shiftDateKey(today, 1)) return "tomorrow";
  const [y, m, d] = dueDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** What a debit is called in a sentence: the item, or "{card} autopay". */
export function lowBalanceItemLabel(item: Pick<ShortfallItem, "kind" | "name">): string {
  return item.kind === "card" ? `${item.name} autopay` : item.name;
}
