import { useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { usePathname, useRouter } from "expo-router";

import {
  isPersistableRoute,
  isRestorableRoute,
  lastRouteStorageKey,
  normalizeStoredRoute,
  shouldRestoreRoute,
} from "@/shared/config/routeRestoration";

/**
 * Remembers the last screen per user and resumes it on a plain cold start.
 *
 * Two rules keep this from fighting the rest of navigation: the key is scoped
 * to the signed-in uid (a saved route must never survive into another account),
 * and restoration is skipped whenever a deep link or notification already
 * decided where the app should open.
 */
export function useNavigationStateRestoration(uid: string | undefined) {
  const pathname = usePathname();
  const router = useRouter();
  const restoredForUid = useRef<string | null>(null);
  // Read inside the async restore without making it a dependency.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // 1. Remember the active route.
  useEffect(() => {
    if (!uid || !pathname) return;
    const route = normalizeStoredRoute(pathname);
    if (!isPersistableRoute(route)) return;
    AsyncStorage.setItem(lastRouteStorageKey(uid), route).catch(() => undefined);
  }, [pathname, uid]);

  // 2. Resume it once per signed-in user, only on an unremarkable launch.
  useEffect(() => {
    if (!uid || restoredForUid.current === uid) return;
    restoredForUid.current = uid;

    let cancelled = false;

    void (async () => {
      const [savedRoute, initialUrl] = await Promise.all([
        AsyncStorage.getItem(lastRouteStorageKey(uid)).catch(() => null),
        // A deep link (or a notification carrying one) is a more specific
        // intent than "wherever you were last time".
        Linking.getInitialURL().catch(() => null),
      ]);
      if (cancelled) return;

      const openedFromLink = Boolean(initialUrl && !isBareLaunchUrl(initialUrl));

      if (
        shouldRestoreRoute({
          savedRoute,
          currentRoute: normalizeStoredRoute(pathnameRef.current),
          openedFromLink,
        })
      ) {
        router.replace(savedRoute as never);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, router]);
}

/**
 * Launching from the home screen still reports a URL on Android
 * (`scheme:///` or the bare host); only a path means a real destination.
 */
function isBareLaunchUrl(url: string): boolean {
  const parsed = Linking.parse(url);
  const path = parsed.path?.replace(/^\/+|\/+$/g, "") ?? "";
  return path.length === 0;
}

/** Clears the remembered route for a user — called on sign-out. */
export async function clearSavedRoute(uid: string): Promise<void> {
  await AsyncStorage.removeItem(lastRouteStorageKey(uid)).catch(() => undefined);
}

export { isRestorableRoute };
