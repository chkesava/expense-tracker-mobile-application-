/**
 * SPENDLY-795 (epic SPENDLY-793): will each paying account cover its coming
 * auto-debits?
 *
 * The debits come from two sources:
 * - **Recurring items** (subscription / EMI / transfer) that the server's
 *   subscription-daily job will post from their `accountId`.
 * - **Credit-card autopay**: the open bill of a card linked to a paying bank
 *   account (SPENDLY-794), for the full remaining amount or the minimum due.
 *
 * **The shortfall is cumulative per account.** Everything due from an account
 * on or before date D counts against that account at D. Two EMIs that each
 * fit alone but not together are flagged. Debits due on the same day all
 * count at that day, because their order isn't known.
 *
 * **Available balance** is the stored `currentBalance` minus the money that
 * group funds hold in that account (`heldByAccount`). A balance that isn't
 * trusted (`storedBalanceTrusted`) gives `trusted: false` and no shortfall
 * figure, so nobody is alerted on a number that may be wrong.
 *
 * **What is not counted:**
 * - Money coming in: salary, or recurring transfers *into* the account.
 *   Counting an inflow that may not arrive would hide a real shortfall.
 * - A debit before today. A missed occurrence is not a future debit.
 *
 * An item is `alerting` only from `dueDate − leadDays` through `dueDate`.
 * Items outside their window still count toward the running total of later
 * debits on the same account.
 *
 * Pure: the server job (SPENDLY-796) and the push source (SPENDLY-797) call
 * this. The app shows the stored result and never runs it (epic 735 rule).
 */

import type { Account } from "../types/expense";
import type { CreditCardBill } from "../types/creditCardBill";
import type { Subscription } from "../types/subscription";
import { storedBalanceTrusted } from "./accountBalance";
import { isCreditCardAccount } from "./accountKind";
import { isValidDateKey, parseLocalDate, shiftDateKey } from "./dates";
import { cardAutopay, LOW_BALANCE_LEAD_DAYS_MAX, subscriptionLeadDays } from "./lowBalanceAlerts";
import { roundMoney } from "./money";
import { autoPostState, upcomingPaymentDates } from "./recurringDetail";
import { isBeforeStartMonth } from "./subscriptionProcessor";

export const AUTO_DEBIT_SHORTFALL_ENGINE_VERSION = 1;

export type AutoDebitKind = "subscription" | "card";

export type UpcomingAutoDebit = {
  kind: AutoDebitKind;
  /** Subscription id, or the card's account id. */
  refId: string;
  /** The card bill this debit pays (cards only). */
  billId?: string;
  name: string;
  /** The account the money leaves. */
  accountId: string;
  dueDate: string;
  amount: number;
  leadDays: number;
};

export type ShortfallItem = UpcomingAutoDebit & {
  /** Everything due from this account up to and including `dueDate`. */
  cumulative: number;
  /** How much more the account needs by `dueDate`; null when the balance isn't trusted. */
  shortBy: number | null;
  /** Inside the item's own alert window today. */
  alerting: boolean;
};

export type AccountShortfall = {
  accountId: string;
  accountName: string;
  /** `currentBalance − held for group funds`; null when not trusted. */
  available: number | null;
  heldForOthers: number;
  trusted: boolean;
  /** Every debit counted on this account in the look-ahead, by date. */
  items: ShortfallItem[];
  /** The largest `shortBy` among alerting items (0 when covered or not trusted). */
  shortBy: number;
};

export type AutoDebitShortfallResult = {
  today: string;
  engineVersion: number;
  /** Only accounts with at least one alerting item that is short, or whose balance can't be trusted. */
  accounts: AccountShortfall[];
  /** At least one alerting item is short on a trusted balance. */
  hasShortfall: boolean;
};

export type AutoDebitShortfallInput = {
  /** The user's calendar day, YYYY-MM-DD. */
  today: string;
  subscriptions: readonly Subscription[];
  accounts: readonly Account[];
  /** Account type names by `typeId`, so cards are recognised as the app does. */
  accountTypeNames?: Readonly<Record<string, string>>;
  creditCardBills: readonly CreditCardBill[];
  groupFunds: readonly { heldByAccount?: Readonly<Record<string, number>> | null }[];
  defaultLeadDays: number;
};

function isCard(account: Account, typeNames: Readonly<Record<string, string>>): boolean {
  return isCreditCardAccount({ typeName: typeNames[account.typeId], accountTypeId: account.accountTypeId });
}

function accountLabel(account: Account): string {
  return (account.displayName || account.name || "Account").trim();
}

function positiveAmount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? roundMoney(value) : 0;
}

/** Already posted: the same test the dues push uses (SPENDLY-695). */
function occurrencePosted(sub: Subscription, date: string): boolean {
  if (sub.frequency === "every_n_days") return typeof sub.lastProcessedDate === "string" && sub.lastProcessedDate >= date;
  return typeof sub.lastProcessed === "string" && sub.lastProcessed >= date.slice(0, 7);
}

/** The recurring debits the server job will post from `accountId`, today through `horizon`. */
export function subscriptionDebits(sub: Subscription, today: string, horizon: string, defaultLeadDays: number): UpcomingAutoDebit[] {
  if (!sub.id || autoPostState(sub) !== "posts" || !sub.accountId) return [];
  const amount = positiveAmount(sub.amount);
  if (amount === 0) return [];
  const span = Math.round((parseLocalDate(horizon).getTime() - parseLocalDate(today).getTime()) / 86_400_000);
  const leadDays = subscriptionLeadDays(sub, defaultLeadDays);
  return upcomingPaymentDates(sub, parseLocalDate(today), span + 2)
    .filter((date) => date >= today && date <= horizon)
    .filter((date) => !isBeforeStartMonth(sub, date.slice(0, 7)))
    .filter((date) => !occurrencePosted(sub, date))
    .map((dueDate) => ({
      kind: "subscription" as const,
      refId: sub.id!,
      name: sub.name || "Recurring payment",
      accountId: sub.accountId!,
      dueDate,
      amount,
      leadDays,
    }));
}

/** What a card's autopay will debit for one bill; 0 when nothing is left to pay. */
export function cardBillDebitAmount(bill: Pick<CreditCardBill, "remainingAmount" | "minimumDueAmount" | "amountPaid">, mode: "total" | "minimum"): number {
  const remaining = positiveAmount(bill.remainingAmount);
  if (mode === "total") return remaining;
  const minimumLeft = positiveAmount(roundMoney(positiveAmount(bill.minimumDueAmount) - positiveAmount(bill.amountPaid)));
  return Math.min(minimumLeft, remaining);
}

/** The autopay debits for one card's open bills, today through `horizon`. */
export function cardDebits(
  card: Account,
  bills: readonly CreditCardBill[],
  today: string,
  horizon: string,
  defaultLeadDays: number
): UpcomingAutoDebit[] {
  const autopay = cardAutopay(card, defaultLeadDays);
  if (!autopay) return [];
  const out: UpcomingAutoDebit[] = [];
  for (const bill of bills) {
    if (bill.accountId !== card.id) continue;
    if (bill.status === "PAID" || bill.status === "CANCELLED") continue;
    if (!isValidDateKey(bill.dueDate) || bill.dueDate < today || bill.dueDate > horizon) continue;
    const amount = cardBillDebitAmount(bill, autopay.amountMode);
    if (amount === 0) continue;
    out.push({
      kind: "card",
      refId: card.id,
      billId: bill.id,
      name: accountLabel(card),
      accountId: autopay.fromAccountId,
      dueDate: bill.dueDate,
      amount,
      leadDays: autopay.leadDays,
    });
  }
  return out;
}

function heldByAccount(groupFunds: AutoDebitShortfallInput["groupFunds"]): Map<string, number> {
  const held = new Map<string, number>();
  for (const fund of groupFunds) {
    for (const [accountId, value] of Object.entries(fund.heldByAccount ?? {})) {
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
      held.set(accountId, roundMoney((held.get(accountId) ?? 0) + value));
    }
  }
  return held;
}

const byDueThenName = (a: UpcomingAutoDebit, b: UpcomingAutoDebit) =>
  a.dueDate.localeCompare(b.dueDate) || a.kind.localeCompare(b.kind) || a.refId.localeCompare(b.refId) || (a.billId ?? "").localeCompare(b.billId ?? "");

export function computeAutoDebitShortfall(input: AutoDebitShortfallInput): AutoDebitShortfallResult {
  const { today, defaultLeadDays } = input;
  const typeNames = input.accountTypeNames ?? {};
  const horizon = shiftDateKey(today, LOW_BALANCE_LEAD_DAYS_MAX);
  const accountsById = new Map(input.accounts.map((a) => [a.id, a]));

  const debits: UpcomingAutoDebit[] = [];
  for (const sub of input.subscriptions) debits.push(...subscriptionDebits(sub, today, horizon, defaultLeadDays));
  for (const account of input.accounts) {
    if (isCard(account, typeNames)) debits.push(...cardDebits(account, input.creditCardBills, today, horizon, defaultLeadDays));
  }

  // Only bank-like paying accounts have a balance to fall short of. A charge
  // to a card uses its credit limit, and an unknown account can't be checked.
  const byAccount = new Map<string, UpcomingAutoDebit[]>();
  for (const debit of debits) {
    const account = accountsById.get(debit.accountId);
    if (!account || isCard(account, typeNames)) continue;
    byAccount.set(debit.accountId, [...(byAccount.get(debit.accountId) ?? []), debit]);
  }

  const held = heldByAccount(input.groupFunds);
  const accounts: AccountShortfall[] = [];
  for (const [accountId, list] of byAccount) {
    const account = accountsById.get(accountId)!;
    const trusted = storedBalanceTrusted(account, false);
    const heldForOthers = held.get(accountId) ?? 0;
    const available = trusted ? roundMoney((account.currentBalance as number) - heldForOthers) : null;

    const sorted = [...list].sort(byDueThenName);
    const totalByDate = new Map<string, number>();
    let running = 0;
    for (const debit of sorted) {
      running = roundMoney(running + debit.amount);
      totalByDate.set(debit.dueDate, running);
    }
    const items: ShortfallItem[] = sorted.map((debit) => {
      const cumulative = totalByDate.get(debit.dueDate)!;
      return {
        ...debit,
        cumulative,
        shortBy: available === null ? null : roundMoney(Math.max(0, cumulative - available)),
        alerting: today >= shiftDateKey(debit.dueDate, -debit.leadDays),
      };
    });

    const alerting = items.filter((i) => i.alerting);
    const shortBy = alerting.reduce((max, i) => Math.max(max, i.shortBy ?? 0), 0);
    if (alerting.length === 0 || (trusted && shortBy <= 0)) continue;
    accounts.push({ accountId, accountName: accountLabel(account), available, heldForOthers, trusted, items, shortBy });
  }

  accounts.sort((a, b) => b.shortBy - a.shortBy || a.accountId.localeCompare(b.accountId));
  return {
    today,
    engineVersion: AUTO_DEBIT_SHORTFALL_ENGINE_VERSION,
    accounts,
    hasShortfall: accounts.some((a) => a.trusted && a.shortBy > 0),
  };
}

/** The alerting, short items of a result: what a push or banner is about. */
export function alertingShortfalls(result: AutoDebitShortfallResult): Array<ShortfallItem & { accountName: string }> {
  return result.accounts.flatMap((a) =>
    a.trusted ? a.items.filter((i) => i.alerting && (i.shortBy ?? 0) > 0).map((i) => ({ ...i, accountName: a.accountName })) : []
  );
}
