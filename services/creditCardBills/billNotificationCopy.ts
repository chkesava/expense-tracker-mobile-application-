import type { Account } from "@/shared/types/expense";
import type { ReminderSlot } from "@/shared/utils/creditCardBillReminders";

export type BillNotificationCopy = {
  title: string;
  body: string;
  data: {
    source: "credit_card_bill";
    billId: string;
    url: string;
  };
};

/** Mask to last 4 digits only — never full PAN. */
export function maskAccountLast4(accountNumber?: string): string | null {
  if (!accountNumber) return null;
  const digits = accountNumber.replace(/\D/g, "");
  if (digits.length < 4) return null;
  return `••••${digits.slice(-4)}`;
}

export function formatCardLabel(account: Pick<Account, "name" | "accountNumber">): string {
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
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(dt);
}

export function buildBillReminderCopy(opts: {
  billId: string;
  account: Pick<Account, "name" | "accountNumber">;
  statementAmount: number;
  currency: string;
  dueDate: string;
  slot: ReminderSlot;
}): BillNotificationCopy {
  const card = formatCardLabel(opts.account);
  const amount = formatMoney(opts.statementAmount, opts.currency);
  const due = formatDueLabel(opts.dueDate);
  const url = `/credit-card-bills/${opts.billId}`;

  let title = "Credit card bill";
  let body = `${card} bill of ${amount} is due on ${due}.`;

  if (opts.slot.kind === "days_before") {
    title = "Credit card bill reminder";
    if (opts.slot.daysBefore === 7) {
      body = `${card} bill of ${amount} is due on ${due}.`;
    } else {
      body = `Reminder: ${card} bill of ${amount} is due in ${opts.slot.daysBefore} days.`;
    }
  } else if (opts.slot.kind === "due_date") {
    title = "Credit card bill due today";
    body = `${card} bill of ${amount} is due today.`;
  } else {
    title = "Credit card bill overdue";
    body = `${card} bill of ${amount} is overdue.`;
  }

  return {
    title,
    body,
    data: {
      source: "credit_card_bill",
      billId: opts.billId,
      url,
    },
  };
}
