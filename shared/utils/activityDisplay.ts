import type { AccountActivity } from "../types/expense";
import { isValidDateKey, parseLocalDate } from "./dates";

const ACTIVITY_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const CLOCK_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i;

function formatClockFromParts(hour: number, minute: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`;
}

function toDate(value: unknown): Date | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof value === "object") {
    const obj = value as {
      toDate?: () => Date;
      seconds?: number;
      _seconds?: number;
    };
    if (typeof obj.toDate === "function") {
      try {
        const date = obj.toDate();
        return date instanceof Date && !Number.isNaN(date.getTime())
          ? date
          : undefined;
      } catch {
        return undefined;
      }
    }
    const seconds = obj.seconds ?? obj._seconds;
    if (typeof seconds === "number") {
      const date = new Date(seconds * 1000);
      return Number.isNaN(date.getTime()) ? undefined : date;
    }
  }
  return undefined;
}

export function formatActivityDateLabel(dateKey: string): string {
  if (!isValidDateKey(dateKey)) return dateKey;
  return ACTIVITY_DATE_FORMATTER.format(parseLocalDate(dateKey));
}

export function formatClockLabel(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const match = trimmed.match(CLOCK_RE);
  if (!match) {
    const parsed = toDate(trimmed);
    if (!parsed) return undefined;
    return formatClockFromParts(parsed.getHours(), parsed.getMinutes());
  }
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const ampm = match[4]?.toLowerCase();
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return undefined;
  return formatClockFromParts(hour, minute);
}

/**
 * Prefer an explicit clock string (SMS / form). Fall back to createdAt only
 * when it carries a real time-of-day — midnight-only timestamps are ignored
 * so we never invent "12:00 AM".
 */
export function resolveActivityClockTime(
  explicitTime?: string,
  createdAt?: unknown
): string | undefined {
  if (explicitTime) {
    const formatted = formatClockLabel(explicitTime);
    if (formatted) return formatted;
  }
  const date = toDate(createdAt);
  if (!date) return undefined;
  if (date.getHours() === 0 && date.getMinutes() === 0) return undefined;
  return formatClockFromParts(date.getHours(), date.getMinutes());
}

/** Minutes from midnight for a clock label such as `08:12 PM` or `20:12`. */
export function clockLabelToMinutes(raw?: string): number | null {
  if (!raw) return null;
  const formatted = formatClockLabel(raw);
  if (!formatted) return null;
  const match = formatted.match(/^(\d{2}):(\d{2}) (AM|PM)$/);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3] === "PM") hour += 12;
  return hour * 60 + Number(match[2]);
}

/**
 * Sort key for bank-statement order: calendar date, then real clock time.
 * Missing clocks sort at the start of that day (never invent 12:00 AM on screen).
 */
export function postingSortMs(
  dateKey: string,
  explicitTime?: string,
  createdAt?: unknown
): number {
  const dayMs = isValidDateKey(dateKey) ? parseLocalDate(dateKey).getTime() : 0;
  const clock = resolveActivityClockTime(explicitTime, createdAt);
  const minutes = clockLabelToMinutes(clock);
  return dayMs + (minutes ?? 0) * 60 * 1000;
}

export function activityTitle(
  activity: Pick<AccountActivity, "note" | "category" | "source">
): string {
  const note = activity.note?.trim();
  if (note) return note;
  return activity.category || activity.source || "Transaction";
}

export function activitySubtypeLabel(
  activity: Pick<
    AccountActivity,
    | "isTransfer"
    | "isBillPayment"
    | "isManualEntry"
    | "isBorrowing"
    | "isLoanRepayment"
    | "isReceivable"
    | "isReceivableRepayment"
    | "category"
    | "source"
    | "counterpartyName"
    | "type"
  >
): string {
  if (activity.isTransfer) return "Transfer";
  if (activity.isBillPayment) return "Bill payment";
  if (activity.isManualEntry) return "Adjustment";
  if (activity.isBorrowing) return "Borrowing";
  if (activity.isLoanRepayment) return "Loan repayment";
  if (activity.isReceivable) return "Lent";
  if (activity.isReceivableRepayment) return "Collection";
  if (activity.category) return activity.category;
  if (activity.source) return activity.source;
  if (activity.counterpartyName) return activity.counterpartyName;
  return activity.type === "credit" ? "Income" : "Expense";
}

export function accountKindSubtitle(
  isCreditCard: boolean,
  typeName: string
): string {
  if (isCreditCard) return "Credit Card";
  const lower = typeName.toLowerCase();
  if (/\bcash\b/.test(lower)) return "Cash Account";
  if (/\bwallet\b/.test(lower)) return "Wallet";
  return "Personal Account";
}
