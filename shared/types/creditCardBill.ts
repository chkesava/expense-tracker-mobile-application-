/**
 * Dedicated credit-card statement/bill entity.
 * Payments use AccountPayment — this is not an expense.
 */

export type CreditCardBillStatus =
  | "UPCOMING"
  | "DUE_SOON"
  | "DUE_TODAY"
  | "OVERDUE"
  | "PARTIALLY_PAID"
  | "PAID"
  | "CANCELLED";

/** Days-before-due slots + due-date + overdue cadence. */
export type CreditCardBillReminderFrequency = {
  daysBefore: number[];
  onDueDate: boolean;
  overdueEveryDays: 1 | 2 | 3;
};

export type CreditCardBill = {
  id: string;
  accountId: string;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  statementDate: string;
  dueDate: string;
  statementAmount: number;
  minimumDueAmount: number;
  amountPaid: number;
  remainingAmount: number;
  currency: string;
  status: CreditCardBillStatus;
  paymentDate?: string;
  note?: string;
  reminderEnabled: boolean;
  reminderFrequency: CreditCardBillReminderFrequency;
  lastReminderSentAt?: string;
  nextReminderAt?: string;
  /** Linked AccountPayment ids applied to this bill (optional audit). */
  paymentIds?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type CreditCardBillReminderLog = {
  id: string;
  billId: string;
  notificationType:
    | "days_before"
    | "due_date"
    | "overdue"
    | "cancelled"
    | "skipped";
  /** Lead days when type is days_before; else undefined. */
  daysBefore?: number;
  sentAt: string;
  channel: "local";
  status: "sent" | "skipped" | "failed";
  reason?: string;
};

export type CreditCardBillRemindersSettings = {
  enabled: boolean;
  daysBefore: number[];
  onDueDate: boolean;
  overdueEveryDays: 1 | 2 | 3;
  quietHoursStart: string;
  quietHoursEnd: string;
};

export const DEFAULT_BILL_REMINDER_FREQUENCY: CreditCardBillReminderFrequency = {
  daysBefore: [7, 3, 1],
  onDueDate: true,
  overdueEveryDays: 1,
};

/** Auto-created statements are due this many calendar days after generation. */
export const CREDIT_CARD_PAYMENT_WINDOW_DAYS = 5;

/** Reminder cadence that fits the 5-day repayment window. */
export const AUTO_CREDIT_CARD_BILL_REMINDER_FREQUENCY: CreditCardBillReminderFrequency =
  {
    daysBefore: [3, 1],
    onDueDate: true,
    overdueEveryDays: 1,
  };

export const DEFAULT_CREDIT_CARD_BILL_REMINDERS: CreditCardBillRemindersSettings =
  {
    enabled: true,
    daysBefore: [7, 3, 1],
    onDueDate: true,
    overdueEveryDays: 1,
    quietHoursStart: "08:00",
    quietHoursEnd: "21:00",
  };

export const OPEN_BILL_STATUSES: CreditCardBillStatus[] = [
  "UPCOMING",
  "DUE_SOON",
  "DUE_TODAY",
  "OVERDUE",
  "PARTIALLY_PAID",
];

export type CreateCreditCardBillInput = {
  accountId: string;
  statementAmount: number;
  minimumDueAmount: number;
  statementDate: string;
  dueDate: string;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  note?: string;
  currency?: string;
  reminderEnabled?: boolean;
  reminderFrequency?: CreditCardBillReminderFrequency;
};
