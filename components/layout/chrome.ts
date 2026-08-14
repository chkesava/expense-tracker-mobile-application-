/**
 * Shared chrome metrics for the compact Android app bar and bottom navigation.
 * Keep PageShell offsets in sync with Header / BottomNav so content is never
 * hidden behind the bars or system insets.
 */
export const APP_BAR_CONTENT_HEIGHT = 56;
export const APP_BAR_HORIZONTAL_PADDING = 16;
export const APP_BAR_ICON_SIZE = 24;
export const APP_BAR_TOUCH_SIZE = 48;

export const BOTTOM_NAV_BAR_HEIGHT = 64;
export const BOTTOM_NAV_FAB_SIZE = 56;
export const BOTTOM_NAV_FAB_OVERHANG = 28;
export const BOTTOM_NAV_CONTENT_CLEARANCE = 24;

export const BOTTOM_NAV_SCROLL_PADDING =
  BOTTOM_NAV_BAR_HEIGHT + BOTTOM_NAV_FAB_OVERHANG + BOTTOM_NAV_CONTENT_CLEARANCE;
