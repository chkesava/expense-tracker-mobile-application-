/**
 * Where a tapped notification may take the user (SPENDLY-230).
 *
 * Two payload shapes reach the Spendly shell:
 * - local reminders: `{ source: "credit_card_bill" | "calendar" | "goal", url }`
 * - server push (227): `{ product: "expense", category, kind, url, entityId }`
 *
 * Only in-app paths under known Spendly screens are followed: no external
 * links, no `//host`, no `..`, nothing outside the allow-list. A Spendly push
 * whose link isn't allowed opens the inbox instead (it's listed there); a push
 * for another product (Ganesh, Nutrition) is ignored here.
 */

import { NOTIFICATION_ROUTE_SOURCES } from "../calendarNotifications";
import { PUSH_CHANNELS } from "../pushPreferences";

export const INBOX_PATH = "/inbox";

/** Spendly screens a push may open (each also matches its sub-paths). */
export const PUSH_ROUTE_ROOTS = [
  "/credit-card-bills",
  "/calendar",
  "/goals",
  "/inbox",
  "/investments",
  "/epf",
  "/vaults",
  "/accounts",
  "/recurring",
  "/settings",
] as const;

const SAFE_PATH = /^\/[A-Za-z0-9_\-./]*(\?[A-Za-z0-9_\-.=&%:]*)?$/;

/** An in-app path: starts with one "/", no "..", only plain characters. */
export function isSafeInAppPath(url: unknown): url is string {
  return typeof url === "string" && SAFE_PATH.test(url) && !url.startsWith("//") && !url.includes("..");
}

/** The path without its query, e.g. "/calendar?date=…" → "/calendar". */
export function pathOf(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

function underAllowedRoot(url: string): boolean {
  const path = pathOf(url);
  return PUSH_ROUTE_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));
}

export type NotificationRoute = { href: string; fallback: boolean };

/** The screen to open for a tapped notification, or null to ignore it. */
export function resolveNotificationRoute(data: unknown): NotificationRoute | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { source?: unknown; product?: unknown; category?: unknown; url?: unknown };

  // Local reminders scheduled on this device.
  if (typeof d.source === "string" && (NOTIFICATION_ROUTE_SOURCES as readonly string[]).includes(d.source)) {
    return isSafeInAppPath(d.url) ? { href: d.url, fallback: false } : null;
  }

  // Server push: Spendly only.
  if (d.product !== "expense") return null;
  if (typeof d.category !== "string" || !(d.category in PUSH_CHANNELS)) return null;
  if (isSafeInAppPath(d.url) && underAllowedRoot(d.url)) return { href: d.url, fallback: false };
  return { href: INBOX_PATH, fallback: true };
}

/**
 * Foreground: no banner when the user is already looking at what the
 * notification is about (it still goes to the notification list).
 */
export function shouldShowBanner(data: unknown, currentPath: string | null): boolean {
  const route = resolveNotificationRoute(data);
  if (!route || route.fallback || !currentPath) return true;
  return pathOf(route.href) !== currentPath;
}
