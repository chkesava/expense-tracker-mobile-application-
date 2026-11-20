/**
 * SPENDLY-797 (epic SPENDLY-793): the one Firestore read of a user's auto-debit
 * inputs, shared by the server job (autodebit-daily, SPENDLY-796) and the
 * low-balance push's send-time re-check (SPENDLY-797). Both read Firestore,
 * never the copy (R4.3a), and both run the same engine, so the stored result
 * and the push can't disagree.
 *
 * Reads: the user document and the active subscriptions and accounts. The
 * account types, open card bills and group funds are read only when the user
 * has an auto-debit (a subscription with an account, or a card linked to a
 * paying account).
 */

import type { CreditCardBill } from "../types/creditCardBill";
import type { Account, AccountType } from "../types/expense";
import { mergeSettingsFromDoc } from "../types/settings";
import type { Subscription } from "../types/subscription";
import { computeAutoDebitShortfall, type AutoDebitShortfallResult } from "./autoDebitShortfall";
import { formatDateKey, isValidTimeZone } from "./dates";
import { DEFAULT_LOW_BALANCE_LEAD_DAYS, isValidLeadDays } from "./lowBalanceAlerts";

/** Bills that can still be paid: everything but PAID and CANCELLED. */
export const AUTO_DEBIT_OPEN_BILL_STATUSES = ["UPCOMING", "DUE_SOON", "DUE_TODAY", "OVERDUE", "PARTIALLY_PAID"] as const;
export const DEFAULT_TIME_ZONE = "Asia/Kolkata";

/* Minimal structural view of the Firestore SDKs (Admin, or the push ports). */
type Snap = { exists: boolean; id: string; data(): Record<string, unknown> | undefined };
type Query = { where(field: string, op: string, value: unknown): Query; get(): Promise<{ docs: Snap[] }> };
export type AutoDebitInputsDb = {
  doc(path: string): { get(): Promise<Snap> };
  collection(path: string): Query & { get(): Promise<{ docs: Snap[] }> };
};

export type AutoDebitInputs = {
  /** The user's settings timezone and default lead days (raw; validated by `computeForInputs`). */
  settings: { timezone?: unknown; defaultLeadDays?: unknown };
  subscriptions: Subscription[];
  accounts: Account[];
  accountTypes: AccountType[];
  /** Open card bills (not PAID or CANCELLED). */
  creditCardBills: CreditCardBill[];
  groupFunds: { heldByAccount?: Record<string, number> | null }[];
};

const rows = <T>(snap: { docs: Snap[] }): T[] => snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));

/** Reads one user's inputs from Firestore. `charge` counts reads for the caller's budget. */
export async function loadAutoDebitInputs(db: AutoDebitInputsDb, uid: string, charge: (reads: number) => void = () => undefined): Promise<AutoDebitInputs> {
  const base = `users/${uid}`;
  const count = <S extends { docs: Snap[] }>(snap: S): S => {
    charge(Math.max(1, snap.docs.length));
    return snap;
  };
  const [userSnap, subsSnap, accountsSnap] = await Promise.all([
    db.doc(base).get(),
    db.collection(`${base}/subscriptions`).where("isActive", "==", true).get().then(count),
    db.collection(`${base}/accounts`).get().then(count),
  ]);
  charge(1);
  const settings = mergeSettingsFromDoc(userSnap.exists ? userSnap.data() ?? {} : null);
  const subscriptions = rows<Subscription>(subsSnap);
  const accounts = rows<Account>(accountsSnap);
  const hasWork =
    subscriptions.some((s) => typeof s.accountId === "string" && s.accountId !== "") ||
    accounts.some((a) => typeof a.autopayFromAccountId === "string" && a.autopayFromAccountId !== "");
  const base_ = { settings: { timezone: settings.timezone, defaultLeadDays: settings.lowBalanceAlerts.defaultLeadDays } };
  // Nothing to check: skip the other reads.
  if (!hasWork) return { ...base_, subscriptions: [], accounts, accountTypes: [], creditCardBills: [], groupFunds: [] };
  const [typesSnap, billsSnap, fundsSnap] = await Promise.all([
    db.collection(`${base}/accountTypes`).get().then(count),
    db.collection(`${base}/creditCardBills`).where("status", "in", [...AUTO_DEBIT_OPEN_BILL_STATUSES]).get().then(count),
    db.collection(`${base}/groupFunds`).get().then(count),
  ]);
  return {
    ...base_,
    subscriptions,
    accounts,
    accountTypes: rows<AccountType>(typesSnap),
    creditCardBills: rows<CreditCardBill>(billsSnap),
    groupFunds: rows<{ heldByAccount?: Record<string, number> | null }>(fundsSnap),
  };
}

/** The user's calendar day, or null when their timezone is invalid. */
export function userToday(now: Date, timezone: unknown): string | null {
  const tz = typeof timezone === "string" && timezone ? timezone : DEFAULT_TIME_ZONE;
  return isValidTimeZone(tz) ? formatDateKey(now, tz) : null;
}

/** The engine over these inputs for `today`. */
export function computeForInputs(inputs: AutoDebitInputs, today: string): AutoDebitShortfallResult {
  return computeAutoDebitShortfall({
    today,
    subscriptions: inputs.subscriptions,
    accounts: inputs.accounts,
    accountTypeNames: Object.fromEntries(inputs.accountTypes.map((t) => [t.id, t.name])),
    creditCardBills: inputs.creditCardBills,
    groupFunds: inputs.groupFunds,
    defaultLeadDays: isValidLeadDays(inputs.settings.defaultLeadDays) ? inputs.settings.defaultLeadDays : DEFAULT_LOW_BALANCE_LEAD_DAYS,
  });
}
