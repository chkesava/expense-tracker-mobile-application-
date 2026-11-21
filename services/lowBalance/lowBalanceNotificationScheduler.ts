/**
 * On-device low-balance alerts (SPENDLY-799, epic SPENDLY-793): the fallback
 * for phones the server doesn't push to.
 *
 * It follows the calendar scheduler: cancel every `lowbal:` notification, then
 * schedule exactly the current plan with stable ids. That way rebuilds,
 * retries and timezone changes never duplicate, and a covered debit stops.
 *
 * It never prompts for permission, never runs on web, and never touches
 * financial data. Every failure is swallowed and logged.
 */

import { logWarning } from "@/lib/errors";
import { dateTriggerFromDateKey, ensureBillNotificationHandler } from "@/services/creditCardBills/billReminderScheduler";
import { LOW_BALANCE_NOTIFICATION_PREFIX, type PlannedLowBalanceNotification } from "@/shared/utils/lowBalanceLocalPlan";
import { PUSH_CHANNELS } from "@/shared/utils/pushPreferences";

/** The same Android channel the push uses (SPENDLY-797), so the phone's own mute applies to both. */
export const LOW_BALANCE_CHANNEL_ID = PUSH_CHANNELS.lowBalance.id;

let channelReady = false;

async function loadNotifications() {
  return import("expo-notifications");
}

async function ensureChannel(): Promise<void> {
  if (channelReady) return;
  const { Platform } = await import("react-native");
  if (Platform.OS === "android") {
    const Notifications = await loadNotifications();
    await Notifications.setNotificationChannelAsync(LOW_BALANCE_CHANNEL_ID, {
      name: PUSH_CHANNELS.lowBalance.name,
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250],
    });
  }
  channelReady = true;
}

/** Cancel every low-balance notification (switch off, push mode, sign-out, plan rebuild). */
export async function cancelLowBalanceNotifications(): Promise<void> {
  try {
    const { Platform } = await import("react-native");
    if (Platform.OS === "web") return;
    const Notifications = await loadNotifications();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => String(n.identifier || "").startsWith(LOW_BALANCE_NOTIFICATION_PREFIX))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
  } catch (e) {
    logWarning("lowBalanceNotifications.cancel", e);
  }
}

/** Replace all low-balance notifications with `plan`. A silent no-op without permission or on web. */
export async function reconcileLowBalanceNotifications(
  plan: readonly PlannedLowBalanceNotification[],
  opts: { windowStart: string; windowEnd: string; timezone?: string }
): Promise<{ scheduled: number }> {
  try {
    const { Platform } = await import("react-native");
    if (Platform.OS === "web") return { scheduled: 0 };
    const Notifications = await loadNotifications();
    await cancelLowBalanceNotifications();
    if (!plan.length) return { scheduled: 0 };
    if ((await Notifications.getPermissionsAsync()).status !== "granted") return { scheduled: 0 };
    await ensureBillNotificationHandler();
    await ensureChannel();
    const now = Date.now();
    let scheduled = 0;
    for (const n of plan) {
      // 09:00 local, moved into the delivery window (like the push).
      const date = dateTriggerFromDateKey(n.fireDate, opts.windowStart, opts.windowEnd, opts.timezone);
      if (date.getTime() <= now) continue; // today's slot already passed
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: n.id,
          content: {
            title: n.title,
            body: n.body,
            data: { source: "lowBalance", url: n.url },
            ...(Platform.OS === "android" ? { channelId: LOW_BALANCE_CHANNEL_ID } : {}),
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
        });
        scheduled++;
      } catch (e) {
        logWarning("lowBalanceNotifications.schedule", e);
      }
    }
    return { scheduled };
  } catch (e) {
    logWarning("lowBalanceNotifications.reconcile", e);
    return { scheduled: 0 };
  }
}
