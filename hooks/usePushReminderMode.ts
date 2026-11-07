/**
 * This phone's reminder mode (SPENDLY-693): "push" when the server delivers
 * the user's reminders, "local" when the phone schedules its own. `loading`
 * stays true until system settings and the registration state are known, so a
 * scheduler never cancels reminders on a guess.
 */

import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";

import { isRegisteredForUser, onPushRegistrationChange } from "@/lib/pushRegistration";
import { useAuth } from "@/providers/AuthProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { reminderMode, type ReminderMode } from "@/shared/utils/push/reminderMode";

export function usePushReminderMode(): { mode: ReminderMode; loading: boolean } {
  const { settings, loading: settingsLoading } = useSystemSettings();
  const { realUser, isDuress } = useAuth();
  const uid = isDuress ? null : realUser?.uid ?? null;
  const [state, setState] = useState<{ registered: boolean; permission: boolean; known: boolean }>({
    registered: false,
    permission: false,
    known: Platform.OS === "web",
  });

  useEffect(() => {
    if (Platform.OS === "web") return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const Notifications = await import("expo-notifications");
        const [registered, perm] = await Promise.all([isRegisteredForUser(uid), Notifications.getPermissionsAsync()]);
        if (!cancelled) setState({ registered, permission: perm.status === "granted", known: true });
      } catch {
        if (!cancelled) setState({ registered: false, permission: false, known: true });
      }
    };
    void refresh();
    const off = onPushRegistrationChange(() => void refresh());
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh();
    });
    return () => {
      cancelled = true;
      off();
      sub.remove();
    };
  }, [uid]);

  return {
    mode: reminderMode({
      pushRemindersLive: settings.pushRemindersLive,
      pushRemindersLiveFor: settings.pushRemindersLiveFor,
      uid,
      registeredForUser: state.registered,
      permissionGranted: state.permission,
    }),
    loading: settingsLoading || !state.known,
  };
}
