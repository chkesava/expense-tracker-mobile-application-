/**
 * Phase 13 — local Android notifications for live SMS transactions.
 * Dynamic-import expo-notifications so vitest never loads it.
 */

import {
  buildAutoAddedNotification,
  buildDetectedNotification,
  type SmsNotificationCopy,
} from "./smsNotificationCopy";
import type { SmsWriteReadyEntry } from "./smsAutoAdd";

export const SMS_NOTIFICATION_CHANNEL_ID = "sms-transactions";
const MAX_NOTIFICATIONS_PER_BATCH = 3;

let handlerReady = false;
let channelReady = false;

async function loadNotifications() {
  return import("expo-notifications");
}

export async function ensureSmsNotificationHandler(): Promise<void> {
  if (handlerReady) return;
  const Notifications = await loadNotifications();
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  handlerReady = true;
}

async function ensureAndroidChannel(): Promise<void> {
  if (channelReady) return;
  const { Platform } = await import("react-native");
  if (Platform.OS !== "android") {
    channelReady = true;
    return;
  }
  const Notifications = await loadNotifications();
  await Notifications.setNotificationChannelAsync(SMS_NOTIFICATION_CHANNEL_ID, {
    name: "Transaction alerts",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250],
    lightColor: "#0F2F4B",
  });
  channelReady = true;
}

/** Request POST_NOTIFICATIONS (Android 13+). Fail soft. */
export async function requestSmsNotificationPermission(): Promise<boolean> {
  try {
    const { Platform } = await import("react-native");
    if (Platform.OS !== "android") return false;
    await ensureSmsNotificationHandler();
    await ensureAndroidChannel();
    const Notifications = await loadNotifications();
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status === "granted") return true;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.status === "granted";
  } catch {
    return false;
  }
}

export async function presentSmsNotification(
  copy: SmsNotificationCopy
): Promise<void> {
  try {
    const granted = await requestSmsNotificationPermission();
    if (!granted) return;
    const Notifications = await loadNotifications();
    await Notifications.scheduleNotificationAsync({
      identifier: copy.identifier,
      content: {
        title: copy.title,
        body: copy.body,
        data: copy.data,
        sound: false,
      },
      trigger: { channelId: SMS_NOTIFICATION_CHANNEL_ID },
    });
  } catch {
    /* notifications are best-effort */
  }
}

/** Live dispatch only — scan/inbox Add does not call this. */
export async function notifySmsDispatch(result: {
  committedEntries: SmsWriteReadyEntry[];
  queuedEntries: SmsWriteReadyEntry[];
}): Promise<void> {
  const committed = result.committedEntries.slice(0, MAX_NOTIFICATIONS_PER_BATCH);
  const remaining = MAX_NOTIFICATIONS_PER_BATCH - committed.length;
  const queued = result.queuedEntries.slice(0, Math.max(0, remaining));

  for (const entry of committed) {
    await presentSmsNotification(buildAutoAddedNotification(entry));
  }
  for (const entry of queued) {
    await presentSmsNotification(buildDetectedNotification(entry));
  }
}
