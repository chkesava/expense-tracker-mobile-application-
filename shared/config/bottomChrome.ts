/**
 * Geometry of Spendly's floating bottom chrome — the nav bar, the action dock,
 * and the add FAB that rides above them.
 *
 * SPENDLY-141: the FAB used to be positioned from numbers written in the nav
 * components while scroll clearance was computed from a second, independent
 * set. The two agreed for the bottom-nav layout and disagreed for the dock, so
 * a list's last row could sit under the button that was meant to float above
 * it. Both sides now read the same metrics from here, and
 * `bottomChromeTopEdge` is the single answer to "how high does the chrome
 * reach", so clearance can never be computed for a FAB that is somewhere else.
 *
 * Pure module on purpose: no React, no react-native, so the invariant between
 * the FAB's offset and the list's padding is provable in a unit test.
 */

/** Which bottom chrome the app shell is rendering (`settings.navigationStyle`). */
export type BottomNavStyle = "bottom" | "dock";

export const BOTTOM_NAV_BAR_HEIGHT = 64;
/** BottomNav never sits flush: it floors the system inset at this. */
export const BOTTOM_NAV_MIN_INSET = 8;
export const BOTTOM_NAV_FAB_SIZE = 56;
/** Gap between the nav bar and the floating add button. */
export const BOTTOM_NAV_FAB_GAP = 12;
/** Inset from the trailing screen edge for the floating add button. */
export const BOTTOM_NAV_FAB_EDGE = 16;
/** Breathing room between the last row of content and the chrome above it. */
export const BOTTOM_NAV_CONTENT_CLEARANCE = 24;

/** The dock has no bar, so its FAB floors the system inset higher. */
export const ACTION_DOCK_MIN_INSET = 16;
export const ACTION_DOCK_FAB_SIZE = 56;
/** Horizontal inset for the dock's trailing menu button. */
export const ACTION_DOCK_EDGE = 24;

/** Distance from the screen bottom to the underside of the bottom-nav FAB. */
export function bottomNavFabOffset(bottomInset: number): number {
  return (
    BOTTOM_NAV_BAR_HEIGHT +
    Math.max(bottomInset, BOTTOM_NAV_MIN_INSET) +
    BOTTOM_NAV_FAB_GAP
  );
}

/** Distance from the screen bottom to the underside of the dock's FAB. */
export function actionDockOffset(bottomInset: number): number {
  return Math.max(bottomInset, ACTION_DOCK_MIN_INSET);
}

export type BottomChromeOptions = {
  /** Which chrome is mounted. Defaults to the bottom nav bar. */
  navStyle?: BottomNavStyle;
  /**
   * When false, clear only the nav bar — for screens that hide the FAB. The
   * dock ignores this: there is no bar under its FAB to clear instead.
   */
  withFab?: boolean;
};

/**
 * Topmost pixel the bottom chrome occupies, measured up from the screen
 * bottom. Content laid out below this line is covered.
 */
export function bottomChromeTopEdge(
  bottomInset: number,
  { navStyle = "bottom", withFab = true }: BottomChromeOptions = {}
): number {
  if (navStyle === "dock") {
    return actionDockOffset(bottomInset) + ACTION_DOCK_FAB_SIZE;
  }
  if (!withFab) {
    return BOTTOM_NAV_BAR_HEIGHT + Math.max(bottomInset, BOTTOM_NAV_MIN_INSET);
  }
  return bottomNavFabOffset(bottomInset) + BOTTOM_NAV_FAB_SIZE;
}

/**
 * Bottom padding a scroll container needs so its last row clears the chrome
 * entirely, with the standard breathing room above it.
 */
export function bottomChromeClearance(
  bottomInset: number,
  options: BottomChromeOptions & { extra?: number } = {}
): number {
  const { extra = 0, ...chrome } = options;
  return (
    bottomChromeTopEdge(bottomInset, chrome) +
    BOTTOM_NAV_CONTENT_CLEARANCE +
    extra
  );
}
