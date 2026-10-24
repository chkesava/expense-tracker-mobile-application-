import type { AccountTransfer, Expense } from "@/shared/types/expense";
import { subscriptionFrequency, type Subscription } from "@/shared/types/subscription";
import { getNextRenewalDate, subscriptionNeedsAccount } from "@/shared/utils/subscriptionProcessor";

/**
 * SPENDLY-582 — the recurring item detail. A `Subscription` is a *definition*
 * of a schedule; the money only exists once the auto-poster turns a due date
 * into a ledger row (an expense, or a transfer for a recurring transfer),
 * stamped with `subscriptionId`. This file keeps the two apart: upcoming dates
 * are projections and never amounts spent, and history is only rows that
 * really carry the link. Pure, no React Native.
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function monthlyDate(year: number, month: number, dayOfMonth: number): string {
  const days = new Date(year, month, 0).getDate();
  return `${year}-${pad(month)}-${pad(Math.min(Math.max(1, dayOfMonth || 1), days))}`;
}

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The last month an EMI with an end set may charge (`YYYY-MM`), else null. */
function endMonthKey(sub: Pick<Subscription, "endMonth" | "endYear">): string | null {
  if (!sub.endMonth || !sub.endYear) return null;
  return `${sub.endYear}-${pad(sub.endMonth)}`;
}

/**
 * The next `count` dates this item is scheduled to charge, from `from`. The
 * first is `getNextRenewalDate` — the app's own rule, which already respects
 * `lastProcessed` and `startMonth` — and the rest step by the cadence. A
 * paused or completed item has none; an EMI stops at its last month.
 */
export function upcomingPaymentDates(sub: Subscription, from: Date, count: number): string[] {
  if (!sub.isActive || sub.isCompleted || count <= 0) return [];
  const first = getNextRenewalDate(sub, from).dateStr;
  const end = endMonthKey(sub);
  const dates: string[] = [];
  if (subscriptionFrequency(sub) === "every_n_days") {
    const step = Math.max(1, Math.round(sub.intervalDays || 1));
    let next = first;
    while (dates.length < count) {
      if (end && next.slice(0, 7) > end) break;
      dates.push(next);
      next = addDays(next, step);
    }
    return dates;
  }
  let year = Number(first.slice(0, 4));
  let month = Number(first.slice(5, 7));
  while (dates.length < count) {
    const key = `${year}-${pad(month)}`;
    if (end && key > end) break;
    dates.push(dates.length === 0 ? first : monthlyDate(year, month, sub.dayOfMonth));
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return dates;
}

export type RecurringPayment = {
  id: string;
  kind: "expense" | "transfer";
  date: string;
  amount: number;
  accountId?: string;
};

/**
 * Ledger rows this item actually posted: live expenses (or, for a recurring
 * transfer, transfers) carrying its `subscriptionId`, newest first. Nothing is
 * matched by name or amount — a manual row that looks similar is not history.
 */
export function recurringHistory(
  sub: Pick<Subscription, "id" | "type">,
  expenses: readonly Expense[],
  transfers: readonly AccountTransfer[]
): RecurringPayment[] {
  if (!sub.id) return [];
  const rows: RecurringPayment[] =
    sub.type === "transfer"
      ? transfers
          .filter((t) => t.subscriptionId === sub.id && t.id)
          .map((t) => ({ id: t.id, kind: "transfer" as const, date: t.date, amount: t.amount, accountId: t.fromAccountId }))
      : expenses
          .filter((e) => e.subscriptionId === sub.id && e.id && !e.deletedAt)
          .map((e) => ({ id: e.id!, kind: "expense" as const, date: e.date, amount: e.amount, accountId: e.accountId }));
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export type AutoPostState = "posts" | "needsAccount" | "trackedOnly" | "paused" | "completed";

/**
 * Whether the app will post this item's charges by itself — derived from the
 * same facts the auto-poster checks, never a stored "auto-pay" flag (there is
 * none). SMS-detected items are tracked, not posted, to avoid double counting.
 */
export function autoPostState(sub: Subscription): AutoPostState {
  if (sub.isCompleted) return "completed";
  if (!sub.isActive) return "paused";
  if (sub.source === "sms") return "trackedOnly";
  if (subscriptionNeedsAccount(sub)) return "needsAccount";
  return "posts";
}

export const AUTO_POST_LABELS: Record<AutoPostState, string> = {
  posts: "Posts automatically on the due date",
  needsAccount: "Needs an account before it can post",
  trackedOnly: "Tracked only — detected from your messages, not posted",
  paused: "Paused — nothing posts until resumed",
  completed: "Completed — no more charges",
};

export function recurringHref(id: string): string {
  return `/recurring/${encodeURIComponent(id)}`;
}

/**
 * Expo Router already decodes route params; decoding again throws a URIError on
 * a malformed sequence (`/recurring/%E0%A4`) and would crash the screen during
 * render. Fall back to the raw value so the screen says "not found" instead.
 */
export function safeDecodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
