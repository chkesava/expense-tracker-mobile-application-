/**
 * SPENDLY-569 — the reminders inbox behind the app-bar bell.
 *
 * Every item is derived from data the app already holds; nothing here is
 * stored except which items this device has seen:
 * - **Dues**: Financial Calendar events (SPENDLY-176 builders) that are
 *   overdue or due within `INBOX_SOON_DAYS` — calendar reminders, card bills,
 *   subscriptions, loan EMIs and money owed to the user. These are the same
 *   events the local calendar notifications are planned from.
 * - **Budgets**: category budgets at or over the warning line this month
 *   (from `computeActiveCategoryBudgets`, never recomputed here).
 *
 * The unread dot counts dues the device hasn't seen. A due's id is the
 * calendar event id (source + record + date), so each new occurrence is new.
 */

import type { CalendarEvent, CalendarRange, CalendarSource } from "../types/calendar";
import type { CategoryBudgetAlertItem } from "./dashboardWidgets";
import { daysBetweenDateKeys, shiftDateKey } from "./dates";

/** How far back an unresolved overdue item stays in the inbox. */
export const INBOX_LOOKBACK_DAYS = 30;
/** "Due soon" = today through this many days ahead (matches calendar priority 2). */
export const INBOX_SOON_DAYS = 3;
/** Seen ids kept per device; older ones fall off (their items have long gone). */
export const INBOX_SEEN_LIMIT = 300;

export type InboxTone = "overdue" | "soon" | "over" | "warning";

export type InboxItem = {
  id: string;
  kind: "due" | "budget";
  source: CalendarSource | "budget";
  title: string;
  subtitle: string;
  /** Null when the source has no reliable amount. */
  amount: number | null;
  currency: string;
  /** Local date key of the due date; absent for budgets. */
  date?: string;
  tone: InboxTone;
  /** In-app route to the record or its screen. */
  href: string;
};

export function inboxRange(today: string): CalendarRange {
  return { from: shiftDateKey(today, -INBOX_LOOKBACK_DAYS), to: shiftDateKey(today, INBOX_SOON_DAYS) };
}

/** "Overdue by 3 days", "Due today", "Due tomorrow", "Due in 2 days". */
export function dueLabel(date: string, today: string): string {
  const days = daysBetweenDateKeys(today, date);
  if (days < 0) return days === -1 ? "Overdue by 1 day" : `Overdue by ${-days} days`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

/**
 * Calendar events → due items: open items that are overdue (within the
 * lookback) or due within `INBOX_SOON_DAYS`. Overdue first (oldest first),
 * then soonest first. Completed, cancelled and recorded events never appear.
 */
export function dueInboxItems(events: readonly CalendarEvent[], today: string): InboxItem[] {
  const range = inboxRange(today);
  const seen = new Set<string>();
  const items: InboxItem[] = [];
  for (const e of events) {
    if (seen.has(e.id)) continue;
    if (e.date < range.from || e.date > range.to) continue;
    const open = e.state === "overdue" || e.state === "scheduled" || e.state === "expected";
    if (!open) continue;
    const overdue = e.state === "overdue" || e.date < today;
    seen.add(e.id);
    items.push({
      id: e.id,
      kind: "due",
      source: e.source,
      title: e.title,
      // The due label only: calendar subtitles can carry unformatted amounts
      // ("Minimum 258.9") that would bypass ghost mode; the amount column is
      // the one ghost-aware place for money.
      subtitle: dueLabel(e.date, today),
      amount: e.amount,
      currency: e.currency,
      date: e.date,
      tone: overdue ? "overdue" : "soon",
      href: e.href,
    });
  }
  return items.sort((a, b) => {
    if (a.tone !== b.tone) return a.tone === "overdue" ? -1 : 1;
    return (a.date ?? "") < (b.date ?? "") ? -1 : (a.date ?? "") > (b.date ?? "") ? 1 : a.id < b.id ? -1 : 1;
  });
}

/**
 * Category budgets at or over the warning line this month, over-budget first.
 * The id carries the level, so crossing from "warning" to "over" is new.
 */
export function budgetInboxItems(
  budgets: readonly CategoryBudgetAlertItem[],
  month: string,
  currency: string,
  href = "/settings/money"
): InboxItem[] {
  return budgets
    .filter((b) => b.isOver || b.isWarning)
    .map((b) => {
      const name = b.subcategory ? `${b.category} · ${b.subcategory}` : b.category;
      const level = b.isOver ? "over" : "warning";
      return {
        id: `budget:${b.id}:${month}:${level}`,
        kind: "budget" as const,
        source: "budget" as const,
        title: name,
        // The amount on the right is what the subtitle names.
        subtitle: b.isOver ? "Over budget · amount over" : `${b.pct}% used · amount left`,
        amount: b.isOver ? Math.max(0, b.spent - b.amount) : Math.max(0, b.amount - b.spent),
        currency,
        tone: (b.isOver ? "over" : "warning") as InboxTone,
        href,
      };
    })
    .sort((a, b) => (a.tone === b.tone ? (a.title < b.title ? -1 : 1) : a.tone === "over" ? -1 : 1));
}

export function unreadCount(items: readonly InboxItem[], seenIds: ReadonlySet<string>): number {
  return items.filter((item) => !seenIds.has(item.id)).length;
}

/** Seen ids after viewing `items`: current ones first, then older, capped. */
export function markInboxSeen(seenIds: readonly string[], items: readonly InboxItem[], limit = INBOX_SEEN_LIMIT): string[] {
  const merged = [...items.map((i) => i.id), ...seenIds];
  return [...new Set(merged)].slice(0, Math.max(0, limit));
}

/** Parses a stored seen list defensively (corrupt storage = nothing seen). */
export function parseSeenIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, INBOX_SEEN_LIMIT) : [];
  } catch {
    return [];
  }
}
