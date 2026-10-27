/**
 * On-device notifications for Save Goals reminders (SPENDLY-612).
 *
 * Same shape as the calendar scheduler (SPENDLY-184): cancel every `goal:`
 * notification, then schedule exactly the plan from
 * shared/utils/goalReminders with its stable ids, so refreshes, retries and
 * timezone changes never duplicate. Reuses the app's notification handler and
 * timezone conversion; adds only a "Savings goals" Android channel.
 *
 * Never prompts on its own (the reminder sheet asks), never runs on web, and
 * never touches goal data — every failure is swallowed and logged.
 */

import { logWarning } from "@/lib/errors";
import { ensureBillNotificationHandler, zonedDateAt } from "@/services/creditCardBills/billReminderScheduler";
import { GOAL_NOTIFICATION_PREFIX, type PlannedGoalNotification } from "@/shared/utils/goalReminders";

export const GOALS_CHANNEL_ID = "savings-goals";

let channelReady = false;

async function loadNotifications() {
  return import("expo-notifications");
}

async function ensureChannel(): Promise<void> {
  if (channelReady) return;
  const { Platform } = await import("react-native");
  if (Platform.OS === "android") {
    const Notifications = await loadNotifications();
    await Notifications.setNotificationChannelAsync(GOALS_CHANNEL_ID, {
      name: "Savings goals",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200],
    });
  }
  channelReady = true;
}

export type GoalNotificationPermission = "granted" | "denied" | "unavailable";

/** Current permission without asking. "unavailable" on web. */
export async function goalNotificationPermission(): Promise<GoalNotificationPermission> {
  try {
    const { Platform } = await import("react-native");
    if (Platform.OS === "web") return "unavailable";
    const Notifications = await loadNotifications();
    return (await Notifications.getPermissionsAsync()).status === "granted" ? "granted" : "denied";
  } catch {
    return "unavailable";
  }
}

/** Ask for permission (from the reminder sheet, when the user turns a reminder on). */
export async function requestGoalNotificationPermission(): Promise<GoalNotificationPermission> {
  try {
    const { Platform } = await import("react-native");
    if (Platform.OS === "web") return "unavailable";
    await ensureBillNotificationHandler();
    await ensureChannel();
    const Notifications = await loadNotifications();
    if ((await Notifications.getPermissionsAsync()).status === "granted") return "granted";
    return (await Notifications.requestPermissionsAsync()).status === "granted" ? "granted" : "denied";
  } catch {
    return "unavailable";
  }
}

export async function cancelGoalNotifications(): Promise<void> {
  try {
    const { Platform } = await import("react-native");
    if (Platform.OS === "web") return;
    const Notifications = await loadNotifications();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => String(n.identifier || "").startsWith(GOAL_NOTIFICATION_PREFIX))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
  } catch (e) {
    logWarning("goalNotifications.cancel", e);
  }
}

/** Replace all goal notifications with `plan`. Silent no-op without permission or on web. */
export async function reconcileGoalNotifications(
  plan: readonly PlannedGoalNotification[],
  opts: { timezone?: string }
): Promise<{ scheduled: number }> {
  try {
    const { Platform } = await import("react-native");
    if (Platform.OS === "web") return { scheduled: 0 };
    const Notifications = await loadNotifications();
    await cancelGoalNotifications();
    if (!plan.length) return { scheduled: 0 };
    if ((await Notifications.getPermissionsAsync()).status !== "granted") return { scheduled: 0 };
    await ensureBillNotificationHandler();
    await ensureChannel();
    const now = Date.now();
    let scheduled = 0;
    for (const n of plan) {
      const [hour, minute] = n.time.split(":").map(Number);
      const date = zonedDateAt(n.fireDate, hour, minute, opts.timezone);
      if (date.getTime() <= now) continue; // today's slot already passed
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: n.id,
          content: {
            title: n.title,
            body: n.body,
            data: { source: "goal", url: n.url, goalId: n.goalId },
            ...(Platform.OS === "android" ? { channelId: GOALS_CHANNEL_ID } : {}),
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
        });
        scheduled++;
      } catch (e) {
        logWarning("goalNotifications.schedule", e);
      }
    }
    return { scheduled };
  } catch (e) {
    logWarning("goalNotifications.reconcile", e);
    return { scheduled: 0 };
  }
}
