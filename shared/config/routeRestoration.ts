/**
 * Decides whether a saved route may be restored on launch.
 *
 * "Resume where you left off" must never win an argument with a more specific
 * destination. If the app was opened by a deep link or a notification tap, or
 * the user has already navigated somewhere by the time restoration resolves,
 * the saved route is stale intent and must be dropped — otherwise restoration
 * silently overrides where the user actually asked to go.
 */

/** Screens worth resuming. Detail routes are matched by prefix. */
const RESTORABLE_ROUTES = [
  "/ledger",
  "/vaults",
  "/investments",
  "/insights",
  "/settings",
  "/data-privacy",
  "/sms-inbox",
  "/app-selector",
  "/accounts/",
  "/credit-card-bills/",
] as const;

/**
 * The landing routes the launch redirect can drop the user on. Restoration is
 * only allowed from one of these — anywhere else means something more specific
 * already routed the user, and that intent wins.
 */
const LANDING_ROUTES = ["/", "/dashboard", "/ledger", "/insights"];

/** Per-user key: a saved route must never leak across accounts. */
export function lastRouteStorageKey(uid: string): string {
  return `@vault_last_active_route:${uid}`;
}

/** Strips the Expo Router group segment so stored paths stay comparable. */
export function normalizeStoredRoute(pathname: string | null | undefined): string {
  if (!pathname) return "";
  return pathname.replace(/^\/\((?:app|nutrition|auth)\)/, "") || "/";
}

export function isRestorableRoute(route: string): boolean {
  return RESTORABLE_ROUTES.some((candidate) =>
    candidate.endsWith("/") ? route.startsWith(candidate) : route === candidate || route.startsWith(`${candidate}?`)
  );
}

/** A route worth persisting: never auth screens, never the bare root. */
export function isPersistableRoute(route: string): boolean {
  if (!route || route === "/") return false;
  if (route.includes("login") || route.startsWith("/onboarding")) return false;
  if (route.startsWith("/google-auth")) return false;
  return true;
}

export function shouldRestoreRoute(input: {
  savedRoute: string | null;
  currentRoute: string;
  /** True when a deep link or notification supplied the launch destination. */
  openedFromLink: boolean;
}): boolean {
  const { savedRoute, currentRoute, openedFromLink } = input;
  if (openedFromLink) return false;
  if (!savedRoute || !isRestorableRoute(savedRoute)) return false;
  if (savedRoute === currentRoute) return false;
  return LANDING_ROUTES.includes(currentRoute);
}
