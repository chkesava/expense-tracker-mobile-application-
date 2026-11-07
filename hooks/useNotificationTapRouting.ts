/**
 * Routes taps on Spendly notifications (local reminders and, since
 * SPENDLY-230, server pushes) to their in-app screen, including the tap that
 * cold-started the app. Runs on every platform: bill reminders are scheduled
 * on iOS too.
 *
 * Mounted in the Spendly shell, so a tap is handled once the user is signed in
 * and the shell is up (a cold-start tap waits for that). Ganesh and Nutrition
 * never mount it. Also tells the foreground handler which screen is open, so a
 * notification about it doesn't show a banner.
 */

import { useEffect } from "react";
import { router, usePathname, type Href } from "expo-router";

import { setCurrentNotificationPath } from "@/lib/notificationHandler";
import { toast } from "@/lib/toast";
import { resolveNotificationRoute } from "@/shared/utils/push/notificationRoutes";

/**
 * `getLastNotificationResponseAsync` keeps returning the launch tap for the
 * lifetime of the process, so a remount of the app shell (sign-out and back in,
 * privacy lock) must not replay that navigation.
 */
const handledColdStartResponseIds = new Set<string>();

export function useNotificationTapRouting() {
  const pathname = usePathname();

  useEffect(() => {
    setCurrentNotificationPath(pathname);
  }, [pathname]);

  useEffect(() => () => setCurrentNotificationPath(null), []);

  useEffect(() => {
    let cancelled = false;
    let sub: { remove: () => void } | undefined;

    const navigateToNotification = (response: {
      notification: { request: { content: { data?: unknown } } };
    }) => {
      // The allow-list lives in one tested place (notificationRoutes): local
      // reminder sources, and Spendly pushes to known screens only.
      const route = resolveNotificationRoute(response.notification.request.content.data);
      if (!route) return;
      if (route.fallback) toast.info("That notification is in your inbox.");
      // `dismissTo` reuses the screen when it is already in the stack, so
      // repeated notification taps cannot pile up duplicate copies of it.
      router.dismissTo(route.href as Href);
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
