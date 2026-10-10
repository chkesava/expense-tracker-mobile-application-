/**
 * Routes taps on Spendly's local notifications (credit-card bill and calendar
 * reminders) to their in-app screen, including the tap that cold-started the
 * app. Runs on every platform: bill reminders are scheduled on iOS too.
 */

import { useEffect } from "react";
import { router, type Href } from "expo-router";

import { isRoutableNotification } from "@/shared/utils/calendarNotifications";

/**
 * `getLastNotificationResponseAsync` keeps returning the launch tap for the
 * lifetime of the process, so a remount of the app shell (sign-out and back in,
 * privacy lock) must not replay that navigation.
 */
const handledColdStartResponseIds = new Set<string>();

export function useNotificationTapRouting() {
  useEffect(() => {
    let cancelled = false;
    let sub: { remove: () => void } | undefined;

    const navigateToNotification = (response: {
      notification: { request: { content: { data?: unknown } } };
    }) => {
      // SPENDLY-184: the allow-list (credit_card_bill, calendar) lives in one
      // tested place; anything else, or a non in-app url, is ignored.
      const data = response.notification.request.content.data;
      if (!isRoutableNotification(data)) return;
      // `dismissTo` reuses the screen when it is already in the stack, so
      // repeated notification taps cannot pile up duplicate copies of it.
      router.dismissTo(data.url as Href);
    };

    void import("expo-notifications").then(async (Notifications) => {
      if (cancelled) return;
      sub = Notifications.addNotificationResponseReceivedListener(
        navigateToNotification
      );

      // A tap that launched the app fires before this listener exists, so the
      // cold-start response has to be collected separately or it is lost.
      const initial = await Notifications.getLastNotificationResponseAsync().catch(
        () => null
      );
      if (cancelled || !initial) return;
      if (handledColdStartResponseIds.has(initial.notification.request.identifier)) {
        return;
      }
      handledColdStartResponseIds.add(initial.notification.request.identifier);
      navigateToNotification(initial);
    });

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);
}
