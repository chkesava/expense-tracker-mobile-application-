/**
 * Credit card bill reminder wording, shared by the on-device reminders and the
 * server push (SPENDLY-231). Pure, so both use exactly the same text.
 *
 * - The amount shown is what is still owed (`remainingAmount`), not the
 *   statement total: after a part payment the reminder says what's left.
 * - With `showAmounts` off (the default, SPENDLY-226) the lock-screen text
 *   names the card but hides the amount and the card's last digits.
 */

import type { CreditCardBill } from "../types/creditCardBill";
import type { ReminderSlot } from "./creditCardBillReminders";

export type BillCardAccount = { name: string; accountNumber?: string };

export type BillNotificationCopy = {
  title: string;
  body: string;
  data: { source: "credit_card_bill"; billId: string; url: string };
};

/** Mask to last 4 digits only — never full PAN. */
export function maskAccountLast4(accountNumber?: string): string | null {
  if (!accountNumber) return null;
  const digits = accountNumber.replace(/\D/g, "");
  if (digits.length < 4) return null;
  return `••••${digits.slice(-4)}`;
}

export function formatCardLabel(account: BillCardAccount): string {
  const masked = maskAccountLast4(account.accountNumber);
  if (masked) return `${account.name} ${masked}`;
  return account.name;
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency || "INR"} ${amount}`;
  }
}

function formatDueLabel(dueDate: string): string {
  const [y, m, d] = dueDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(dt);
}

export function billUrl(billId: string): string {
  return `/credit-card-bills/${billId}`;
}

export function buildBillReminderCopy(opts: {
  billId: string;
  /** Null when unknown; the copy then says "Your credit card". */
  account: BillCardAccount | null;
  /** What is still owed. */
  amount: number;
  currency: string;
  dueDate: string;
  slot: ReminderSlot;
  /** Amounts and card digits on the lock screen. Defaults to shown (on-device behaviour before SPENDLY-226). */
  showAmounts?: boolean;
}): BillNotificationCopy {
  const show = opts.showAmounts !== false;
  const card = opts.account ? (show ? formatCardLabel(opts.account) : opts.account.name) : "Your credit card";
  const bill = show ? `${card} bill of ${formatMoney(opts.amount, opts.currency)}` : `${card} bill`;
  const due = formatDueLabel(opts.dueDate);

  let title: string;
  let body: string;
  if (opts.slot.kind === "days_before") {
    title = "Credit card bill reminder";
    body =
      opts.slot.daysBefore === 7
        ? `${bill} is due on ${due}.`
        : `Reminder: ${bill} is due in ${opts.slot.daysBefore} ${opts.slot.daysBefore === 1 ? "day" : "days"}.`;
  } else if (opts.slot.kind === "due_date") {
    title = "Credit card bill due today";
    body = `${bill} is due today.`;
  } else {
    title = "Credit card bill overdue";
    body = `${bill} is overdue.`;
  }

  return { title, body, data: { source: "credit_card_bill", billId: opts.billId, url: billUrl(opts.billId) } };
}

/** The amount a reminder shows for this bill: what is still owed. */
export function billReminderAmount(bill: Pick<CreditCardBill, "remainingAmount" | "statementAmount">): number {
  return Number.isFinite(bill.remainingAmount) ? bill.remainingAmount : bill.statementAmount;
}
