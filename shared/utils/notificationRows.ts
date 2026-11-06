/**
 * The in-app notification rows, users/{uid}/notifications (SPENDLY-230).
 *
 * SIP execution writes them today; the server events (SIP/EPF, shared splits
 * and vaults, price alerts) write one for every push they send. The unified
 * inbox lists the most recent and counts the unread; `read` is stored on the
 * row, so it is the same on every device.
 */

import { timestampMillis } from "./readModel/mapping";
import { isSafeInAppPath } from "./push/notificationRoutes";

export const NOTIFICATIONS_COLLECTION = "notifications";
/** The inbox shows (and listens to) this many recent rows. */
export const NOTIFICATION_ROWS_LIMIT = 30;

export type NotificationRow = {
  id: string;
  type: string;
  category: string | null;
  title: string;
  body: string;
  /** In-app route; null when the row has none (or an unsafe one). */
  url: string | null;
  read: boolean;
  createdAtMs: number;
  meta: Record<string, unknown> | null;
};

/** A stored row → what the inbox shows; null when it has nothing to show. */
export function toNotificationRow(id: string, data: Record<string, unknown>): NotificationRow | null {
  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (!title) return null;
  return {
    id,
    type: typeof data.type === "string" ? data.type : "info",
    category: typeof data.category === "string" ? data.category : null,
    title,
    body: typeof data.body === "string" ? data.body : "",
    url: isSafeInAppPath(data.url) ? data.url : null,
    read: data.read === true,
    createdAtMs: timestampMillis(data.createdAt) ?? 0,
    meta: data.meta && typeof data.meta === "object" ? (data.meta as Record<string, unknown>) : null,
  };
}

/** Newest first, at most `limit`. */
export function recentNotificationRows(docs: readonly { id: string; data: Record<string, unknown> }[], limit = NOTIFICATION_ROWS_LIMIT): NotificationRow[] {
  return docs
    .map((d) => toNotificationRow(d.id, d.data))
    .filter((r): r is NotificationRow => r !== null)
    .sort((a, b) => b.createdAtMs - a.createdAtMs || (a.id < b.id ? -1 : 1))
    .slice(0, limit);
}

export function unreadRowCount(rows: readonly NotificationRow[]): number {
  return rows.filter((r) => !r.read).length;
}

/** Where tapping a row goes: its own link, or the SIP screen for SIP rows. */
export function notificationRowHref(row: NotificationRow): string | null {
  if (row.url) return row.url;
  if (row.type.startsWith("sip_")) return "/investments";
  return null;
}

/** "Just now", "5 min ago", "3 h ago", "Yesterday", "4 days ago", then the date. */
export function timeAgoLabel(ms: number, nowMs: number): string {
  if (!ms) return "";
  const minutes = Math.floor((nowMs - ms) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(ms));
}
