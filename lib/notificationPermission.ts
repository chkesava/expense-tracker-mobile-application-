/**
 * Asking for notification permission the Spendly way (SPENDLY-225): rules in
 * shared/utils/push/permissionFlow. Only from something the user did (a
 * reminder switch, the Notifications card); an explanation first, then the
 * system dialog; "Open settings" once the phone won't ask again; "Not now"
 * remembered for automatic asks. Background work only reads the permission.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking, Platform } from "react-native";

import { appDialog, hasAppDialogHost } from "@/lib/appDialog";
import { logWarning } from "@/lib/errors";
import {
  PERMISSION_COPY,
  nextPermissionStep,
  toPermissionState,
  type PermissionReason,
  type PermissionState,
} from "@/shared/utils/push/permissionFlow";

const DECLINED_KEY = "spendly:notifications:declinedAt";

/** The current permission, without asking. */
export async function readNotificationPermission(): Promise<PermissionState> {
  try {
    if (Platform.OS === "web") return "unavailable";
    const Notifications = await import("expo-notifications");
    const res = await Notifications.getPermissionsAsync();
    return toPermissionState({ platform: Platform.OS, status: res.status, canAskAgain: res.canAskAgain });
  } catch (e) {
    logWarning("notificationPermission.read", e);
    return "unavailable";
  }
}

export async function openNotificationSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch (e) {
    logWarning("notificationPermission.openSettings", e);
  }
}

function choose(title: string, message: string, yes: string): Promise<boolean> {
  return new Promise((resolve) => {
    appDialog.show({
      title,
      message,
      dismissible: true,
      buttons: [
        { text: "Not now", style: "cancel", onPress: () => resolve(false) },
        { text: yes, onPress: () => resolve(true) },
      ],
    });
  });
}

/**
 * Explains, then asks. Resolves true only when notifications end up allowed.
 * `explicit`: the user started this (a switch, a button); automatic asks
 * respect the 14-day "Not now".
 */
export async function askForNotifications(reason: PermissionReason, opts: { explicit?: boolean } = {}): Promise<boolean> {
  const explicit = opts.explicit !== false;
  const state = await readNotificationPermission();
  const declinedRaw = await AsyncStorage.getItem(DECLINED_KEY).catch(() => null);
  const step = nextPermissionStep(state, { explicit, lastDeclinedMs: Number(declinedRaw) || null, nowMs: Date.now() });
  if (step === "none") return true;
  if (step === "unavailable" || step === "snoozed") return false;

  if (step === "open-settings") {
    if (!hasAppDialogHost()) return false;
    const open = await choose(
      "Notifications are off for Spendly",
      "Your phone won't ask again. Turn on notifications for Spendly in your phone's settings to get these.",
      "Open settings"
    );
    if (open) await openNotificationSettings();
    return false;
  }

  // An explanation before the system dialog (when the app can show one).
  if (hasAppDialogHost()) {
    const copy = PERMISSION_COPY[reason];
    const go = await choose(copy.title, copy.message, "Allow");
    if (!go) {
      await AsyncStorage.setItem(DECLINED_KEY, String(Date.now())).catch(() => undefined);
      return false;
    }
  }
  try {
    const Notifications = await import("expo-notifications");
    const granted = (await Notifications.requestPermissionsAsync()).status === "granted";
    if (!granted) await AsyncStorage.setItem(DECLINED_KEY, String(Date.now())).catch(() => undefined);
    return granted;
  } catch (e) {
    logWarning("notificationPermission.request", e);
    return false;
  }
}
