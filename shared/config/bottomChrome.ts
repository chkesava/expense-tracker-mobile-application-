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

/*
 * SPENDLY-161/172: Spendly's bottom nav is a floating capsule rather than a
 * full-width bar. Since SPENDLY-172 it spans almost the whole screen width,
 * after the iOS-style reference, and the add FAB floats above its trailing end
 * instead of sitting beside it and squeezing the tabs. The `BOTTOM_NAV_*`
 * constants above describe the old flat bar and stay because the Ganesh and
 * Nutrition tab bars still size themselves from them.
 */
export const CAPSULE_HEIGHT = 68;
/** A full pill: half the height. */
export const CAPSULE_RADIUS = CAPSULE_HEIGHT / 2;
/** The capsule floats: it floors the system inset higher than the old bar. */
export const CAPSULE_MIN_INSET = 12;
/** Horizontal margin between the capsule and the screen edge: nearly full width. */
export const CAPSULE_SIDE_MARGIN = 4;
/** Vertical gap between the capsule's top and the FAB floating above it. */
export const CAPSULE_FAB_GAP = 10;
export const CAPSULE_FAB_SIZE = 56;
/** Inset of the floating FAB from the trailing screen edge. */
export const CAPSULE_FAB_EDGE = 12;

/** Distance from the screen bottom to the underside of the nav capsule. */
export function capsuleOffset(bottomInset: number): number {
  return Math.max(bottomInset, CAPSULE_MIN_INSET);
}

/**
 * Distance from the screen bottom to the underside of the bottom-nav FAB,
 * which floats `CAPSULE_FAB_GAP` above the capsule's top.
 */
export function bottomNavFabOffset(bottomInset: number): number {
  return capsuleOffset(bottomInset) + CAPSULE_HEIGHT + CAPSULE_FAB_GAP;
}

/** Distance from the screen bottom to the underside of the dock's FAB. */
export function actionDockOffset(bottomInset: number): number {
  return Math.max(bottomInset, ACTION_DOCK_MIN_INSET);
}

export type BottomChromeOptions = {
  /** Which chrome is mounted. Defaults to the bottom nav bar. */
  navStyle?: BottomNavStyle;
  /**
   * When false, the screen hides the FAB. Neither chrome gets shorter for it:
   * the bottom nav always renders its floating FAB, and the dock's FAB is the
   * chrome itself. Kept so callers can state intent.
   */
  withFab?: boolean;
};

/**
 * Topmost pixel the bottom chrome occupies, measured up from the screen
 * bottom. Content laid out below this line is covered.
 */
export function bottomChromeTopEdge(
  bottomInset: number,
  { navStyle = "bottom" }: BottomChromeOptions = {}
): number {
  if (navStyle === "dock") {
    return actionDockOffset(bottomInset) + ACTION_DOCK_FAB_SIZE;
  }
  // The FAB floats above the capsule, so it is the chrome's highest point.
  return bottomNavFabOffset(bottomInset) + CAPSULE_FAB_SIZE;
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

/*
 * SPENDLY-165: the capsule has a fixed height but its width depends on the
 * screen, and five labels at a large system font scale overflow a narrow
 * phone. Below these widths the labels drop out and the tabs go icon-only;
 * each tab keeps its accessibility label, so nothing is lost to a screen
 * reader.
 */
/** Narrowest tab (dp) that still fits an 11pt label (shrinkable to 75%) at 1× font. */
export const NAV_LABEL_MIN_TAB_WIDTH = 52;
/** Label font scaling stops here; beyond it the label would clip. */
export const NAV_LABEL_MAX_FONT_SCALE = 1.3;

/** Width of one tab, given the measured tab-row width. */
export function navTabWidth(rowWidth: number, tabCount: number): number {
  return tabCount > 0 ? rowWidth / tabCount : rowWidth;
}

/** True when the tab row is too tight for labels at this font scale. */
export function shouldCompactNavLabels(
  rowWidth: number,
  tabCount: number,
  fontScale: number
): boolean {
  if (rowWidth <= 0) return false; // not measured yet
  const effectiveScale = Math.min(Math.max(fontScale, 1), NAV_LABEL_MAX_FONT_SCALE);
  return navTabWidth(rowWidth, tabCount) < NAV_LABEL_MIN_TAB_WIDTH * effectiveScale;
}

/**
 * Width available to the tab row on a screen of `screenWidth`: the screen,
 * minus side margins, minus capsule padding. The FAB floats above, so it
 * takes no width from the row.
 */
export function capsuleRowWidth(screenWidth: number, capsulePadding = 8): number {
  return screenWidth - CAPSULE_SIDE_MARGIN * 2 - capsulePadding * 2;
}
