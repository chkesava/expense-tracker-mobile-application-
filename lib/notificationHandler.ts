/**
 * The one foreground notification handler for the app (SPENDLY-230). It was
 * set in two places (app/_layout and the bill scheduler), the last one
 * winning; both now install this.
 *
 * A notification about the screen the user is already on doesn't show a
 * banner (it still goes to the list); everything else shows as before.
 */

import { shouldShowBanner } from "@/shared/utils/push/notificationRoutes";

let currentPath: string | null = null;

/** Updated by the Spendly shell as the route changes; null when it isn't mounted. */
export function setCurrentNotificationPath(path: string | null): void {
  currentPath = path;
}

export function currentNotificationPath(): string | null {
  return currentPath;
}

export const spendlyNotificationHandler = {
  handleNotification: async (notification: { request: { content: { data?: unknown } } }) => {
    const banner = shouldShowBanner(notification.request.content.data, currentPath);
    return {
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: banner,
      shouldShowList: true,
    };
  },
};
