/**
 * The phone's notification permission for Spendly, and (Android) which
 * Spendly categories are muted in the phone's own settings (SPENDLY-225).
 * Read-only; refreshes when the app returns to the foreground, so coming back
 * from the phone's settings shows the change.
 */

import { useCallback, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";

import { readNotificationPermission } from "@/lib/notificationPermission";
import { PUSH_CHANNELS } from "@/shared/utils/pushPreferences";
import type { PermissionState } from "@/shared/utils/push/permissionFlow";

export function useNotificationPermission() {
  const [state, setState] = useState<PermissionState | null>(null);
  const [muted, setMuted] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    const next = await readNotificationPermission();
    setState(next);
    if (Platform.OS !== "android" || next !== "granted") {
      setMuted([]);
      return;
    }
    try {
      const Notifications = await import("expo-notifications");
      const names: string[] = [];
      const seen = new Set<string>();
      for (const channel of Object.values(PUSH_CHANNELS)) {
        if (seen.has(channel.id)) continue;
        seen.add(channel.id);
        const c = await Notifications.getNotificationChannelAsync(channel.id);
        if (c && c.importance === Notifications.AndroidImportance.NONE) names.push(channel.name);
      }
      setMuted(names);
    } catch {
      setMuted([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return { state, muted, refresh };
}
