/**
 * Creates one Android notification channel per Spendly push category
 * (SPENDLY-226), so a push the server sends with a `channelId` shows in the
 * right channel and the user can mute a category from the phone's settings.
 *
 * Ids, names and importance come from PUSH_CHANNELS and match the channels the
 * local reminders already create (Android never lowers or raises an existing
 * channel's importance, so they must agree). Android only; never throws.
 */

import { logWarning } from "@/lib/errors";
import { PUSH_CHANNELS } from "@/shared/utils/pushPreferences";

let ready = false;

export async function ensurePushChannels(): Promise<void> {
  if (ready) return;
  try {
    const { Platform } = await import("react-native");
    if (Platform.OS !== "android") {
      ready = true;
      return;
    }
    const Notifications = await import("expo-notifications");
    const seen = new Set<string>();
    for (const channel of Object.values(PUSH_CHANNELS)) {
      if (seen.has(channel.id)) continue;
      seen.add(channel.id);
      await Notifications.setNotificationChannelAsync(channel.id, {
        name: channel.name,
        importance:
          channel.importance === "high" ? Notifications.AndroidImportance.HIGH : Notifications.AndroidImportance.DEFAULT,
      });
    }
    ready = true;
  } catch (e) {
    logWarning("pushChannels.ensure", e);
  }
}
