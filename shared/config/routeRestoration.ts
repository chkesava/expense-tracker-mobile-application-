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
  "/settings/",
  "/decisions",
  "/decisions/",
  "/fees",
  "/fees/",
  "/app-selector",
  "/accounts/",
  "/credit-card-bills/",
  "/transactions",
  "/transactions/",
  "/runway",
  "/runway/",
  "/calendar",
  "/goals",
  "/goals/",
  "/what-if",
  "/what-if/",
  "/inbox",
  "/spending",
  "/spending/",
  "/budgets",
  "/budgets/",
  "/trends",
  "/top-categories",
  "/recurring",
  "/recurring/",
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

/**
 * The query params that are part of a screen's view (which month, tab,
 * granularity, period, range, merchant or filter) and are worth restoring.
 * Path params (`category`, `sub`, `id`) are not listed: Expo Router reports
 * them as params too, but they are already in the pathname (PR #239 review).
 */
export const RESTORED_QUERY_KEYS = ["month", "tab", "gran", "period", "range", "merchant", "filter"] as const;

/** `route` plus its view params, in a stable order, for saving. */
export function routeWithViewParams(route: string, params: Record<string, string | string[] | undefined>): string {
  const query = RESTORED_QUERY_KEYS.flatMap((key) => {
    const value = params[key];
    return typeof value === "string" && value ? [`${key}=${encodeURIComponent(value)}`] : [];
  });
  return query.length ? `${route}?${query.join("&")}` : route;
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
  // SPENDLY-7 deleted the `/google-auth` route, but this guard outlives it: a
  // device upgrading from an older build can still have that route saved, and
  // restoring to one that no longer exists would land the user nowhere.
  if (route.startsWith("/google-auth")) return false;
  return true;
}

export function shouldRestoreRoute(input: {
  savedRoute: string | null;
  currentRoute: string;
  /** True when a deep link or notification supplied the launch destination. */
  openedFromLink: boolean;
  /** True when a home-screen Quick Action already decided where to go. */
  openedFromShortcut?: boolean;
}): boolean {
  const { savedRoute, currentRoute, openedFromLink, openedFromShortcut } = input;
  if (openedFromLink || openedFromShortcut) return false;
  if (!savedRoute || !isRestorableRoute(savedRoute)) return false;
  if (savedRoute === currentRoute) return false;
  return LANDING_ROUTES.includes(currentRoute);
}
