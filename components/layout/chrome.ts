/**
 * Shared chrome metrics for the compact Android app bar and bottom navigation.
 * Keep PageShell offsets in sync with Header / BottomNav so content is never
 * hidden behind the bars or system insets.
 *
 * The bottom half of this now lives in `shared/config/bottomChrome`, so the
 * FAB's own offset and the list clearance that has to beat it are computed
 * from one set of numbers (SPENDLY-141). Re-exported here because the layout
 * components already import chrome metrics from this module.
 */
import {
  BOTTOM_NAV_BAR_HEIGHT,
  BOTTOM_NAV_CONTENT_CLEARANCE,
  BOTTOM_NAV_FAB_GAP,
  BOTTOM_NAV_FAB_SIZE,
} from "@/shared/config/bottomChrome";

export {
  ACTION_DOCK_EDGE,
  ACTION_DOCK_FAB_SIZE,
  ACTION_DOCK_MIN_INSET,
  BOTTOM_NAV_BAR_HEIGHT,
  BOTTOM_NAV_CONTENT_CLEARANCE,
  BOTTOM_NAV_FAB_EDGE,
  BOTTOM_NAV_FAB_GAP,
  BOTTOM_NAV_FAB_SIZE,
  BOTTOM_NAV_MIN_INSET,
  CAPSULE_FAB_EDGE,
  CAPSULE_FAB_GAP,
  CAPSULE_FAB_SIZE,
  CAPSULE_HEIGHT,
  CAPSULE_MIN_INSET,
  CAPSULE_RADIUS,
  CAPSULE_SIDE_MARGIN,
  actionDockOffset,
  capsuleOffset,
  bottomChromeClearance,
  bottomChromeTopEdge,
  bottomNavFabOffset,
  type BottomNavStyle,
} from "@/shared/config/bottomChrome";

export const APP_BAR_CONTENT_HEIGHT = 56;
export const APP_BAR_HORIZONTAL_PADDING = 16;
export const APP_BAR_ICON_SIZE = 24;
export const APP_BAR_TOUCH_SIZE = 48;

/**
 * Ganesh Seva's own screen shell still pads from these flat totals (it renders
 * its own bottom bar, not Spendly's). Left here, unchanged, so Spendly's
 * nav-style-aware clearance cannot move another product's layout.
 */
export const BOTTOM_NAV_SCROLL_PADDING =
  BOTTOM_NAV_BAR_HEIGHT + BOTTOM_NAV_CONTENT_CLEARANCE;

/** Extra scroll room so the last card clears the trailing FAB. */
export const BOTTOM_NAV_FAB_CLEARANCE =
  BOTTOM_NAV_FAB_SIZE + BOTTOM_NAV_FAB_GAP;

export const BOTTOM_NAV_SCROLL_PADDING_WITH_FAB =
  BOTTOM_NAV_SCROLL_PADDING + BOTTOM_NAV_FAB_CLEARANCE;
