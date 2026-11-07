/**
 * Clears the signed-in user's local reminders from this device (SPENDLY-691).
 *
 * Cancels every scheduled bill, calendar and goal reminder and removes any
 * that are already showing in the tray, so the next person to use the device
 * never sees them. Notifications from other products and sources are left
 * alone (see shared/utils/userReminderNotifications).
 *
 * Never throws and never blocks sign-out: on web, or when the native module
 * isn't available, it does nothing; any failure is logged as a warning. The
 * user's reminders are rebuilt from their data the next time they sign in.
 */

import { logWarning } from "@/lib/errors";
import { isUserReminderNotificationId } from "@/shared/utils/userReminderNotifications";

export async function clearUserReminderNotifications(): Promise<{ cancelled: number; dismissed: number }> {
  const result = { cancelled: 0, dismissed: 0 };
  try {
    const { Platform } = await import("react-native");
    if (Platform.OS === "web") return result;
    const Notifications = await import("expo-notifications");

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const toCancel = scheduled
      .map((n) => n.identifier)
      .filter(isUserReminderNotificationId);
    await Promise.all(toCancel.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
    result.cancelled = toCancel.length;

    const presented = await Notifications.getPresentedNotificationsAsync();
    const toDismiss = presented
      .map((n) => n.request?.identifier)
      .filter(isUserReminderNotificationId) as string[];
    await Promise.all(toDismiss.map((id) => Notifications.dismissNotificationAsync(id)));
    result.dismissed = toDismiss.length;
  } catch (e) {
    logWarning("userReminderNotifications.clear", e);
  }
  return result;
}
