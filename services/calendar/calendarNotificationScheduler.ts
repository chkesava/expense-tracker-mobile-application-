/**
 * On-device notifications for the Financial Calendar (SPENDLY-184).
 *
 * Follows the card-bill scheduler: cancel every `cal:` notification, then
 * schedule exactly the current plan with stable ids, so refreshes, retries and
 * timezone changes never duplicate, and completed or cancelled items stop.
 * Never prompts for permission here (the settings switch does), never runs on
 * web, and never touches financial data — every failure is swallowed and
 * logged.
 */

import { logWarning } from "@/lib/errors";
import { dateTriggerFromDateKey, ensureBillNotificationHandler } from "@/services/creditCardBills/billReminderScheduler";
import { CALENDAR_NOTIFICATION_PREFIX, type PlannedNotification } from "@/shared/utils/calendarNotifications";

export const CALENDAR_CHANNEL_ID = "financial-calendar";

let channelReady = false;

async function loadNotifications() {
  return import("expo-notifications");
}

async function ensureChannel(): Promise<void> {
  if (channelReady) return;
  const { Platform } = await import("react-native");
  if (Platform.OS === "android") {
    const Notifications = await loadNotifications();
    await Notifications.setNotificationChannelAsync(CALENDAR_CHANNEL_ID, {
      name: "Financial calendar",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200],
    });
  }
  channelReady = true;
}

/** Ask for permission (used by the settings switch). */
export async function requestCalendarNotificationPermission(): Promise<boolean> {
  try {
    const { Platform } = await import("react-native");
    if (Platform.OS === "web") return false;
    await ensureBillNotificationHandler();
    await ensureChannel();
    const Notifications = await loadNotifications();
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status === "granted") return true;
    return (await Notifications.requestPermissionsAsync()).status === "granted";
  } catch {
    return false;
  }
}

/** Cancel every calendar notification (switches off, sign-out, plan rebuild). */
export async function cancelCalendarNotifications(): Promise<void> {
  try {
    const Notifications = await loadNotifications();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => String(n.identifier || "").startsWith(CALENDAR_NOTIFICATION_PREFIX))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
  } catch (e) {
    logWarning("calendarNotifications.cancel", e);
  }
}

/** Replace all calendar notifications with `plan`. Silent no-op without permission or on web. */
export async function reconcileCalendarNotifications(
  plan: readonly PlannedNotification[],
  opts: { quietHoursStart: string; quietHoursEnd: string; timezone?: string }
): Promise<{ scheduled: number }> {
  try {
    const { Platform } = await import("react-native");
    if (Platform.OS === "web") return { scheduled: 0 };
    const Notifications = await loadNotifications();
    await cancelCalendarNotifications();
    if (!plan.length) return { scheduled: 0 };
    if ((await Notifications.getPermissionsAsync()).status !== "granted") return { scheduled: 0 };
    await ensureBillNotificationHandler();
    await ensureChannel();
    const now = Date.now();
    let scheduled = 0;
    for (const n of plan) {
      const date = dateTriggerFromDateKey(n.fireDate, opts.quietHoursStart, opts.quietHoursEnd, opts.timezone);
      if (date.getTime() <= now) continue; // already past today's slot
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: n.id,
          content: {
            title: n.title,
            body: n.body,
            data: { source: "calendar", url: n.url, eventId: n.eventId },
            ...(Platform.OS === "android" ? { channelId: CALENDAR_CHANNEL_ID } : {}),
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
        });
        scheduled++;
      } catch (e) {
        logWarning("calendarNotifications.schedule", e);
      }
    }
    return { scheduled };
  } catch (e) {
    logWarning("calendarNotifications.reconcile", e);
    return { scheduled: 0 };
  }
}
