import { describe, expect, it } from "vitest";

import {
  ACTION_DOCK_FAB_SIZE,
  BOTTOM_NAV_BAR_HEIGHT,
  BOTTOM_NAV_CONTENT_CLEARANCE,
  BOTTOM_NAV_FAB_SIZE,
  BOTTOM_NAV_MIN_INSET,
  actionDockOffset,
  bottomChromeClearance,
  bottomChromeTopEdge,
  bottomNavFabOffset,
  type BottomNavStyle,
} from "@/shared/config/bottomChrome";

/** Gesture bar, three-button nav, notchless Android, tall iPhone, web. */
const INSETS = [0, 8, 16, 24, 34, 48];
const STYLES: BottomNavStyle[] = ["bottom", "dock"];

describe("bottom chrome geometry", () => {
  it("floors the inset the way BottomNav itself does", () => {
    expect(bottomNavFabOffset(0)).toBe(bottomNavFabOffset(BOTTOM_NAV_MIN_INSET));
    expect(bottomNavFabOffset(34)).toBe(BOTTOM_NAV_BAR_HEIGHT + 34 + 12);
  });

  it("floors the dock inset at the dock's own minimum", () => {
    expect(actionDockOffset(0)).toBe(16);
    expect(actionDockOffset(34)).toBe(34);
  });

  it("puts the bottom-nav FAB above the bar", () => {
    expect(bottomChromeTopEdge(34)).toBe(
      BOTTOM_NAV_BAR_HEIGHT + 34 + 12 + BOTTOM_NAV_FAB_SIZE
    );
  });

  it("measures the dock from its FAB, since it has no bar", () => {
    expect(bottomChromeTopEdge(34, { navStyle: "dock" })).toBe(
      34 + ACTION_DOCK_FAB_SIZE
    );
  });

  it("still clears the dock's FAB when the caller opts out of the FAB", () => {
    // `withFab: false` means "this screen hides the trailing FAB". The dock's
    // FAB is the chrome, so there is nothing smaller to fall back to.
    expect(bottomChromeTopEdge(0, { navStyle: "dock", withFab: false })).toBe(
      bottomChromeTopEdge(0, { navStyle: "dock" })
    );
  });

  it("clears only the bar when the bottom-nav FAB is hidden", () => {
    expect(bottomChromeTopEdge(34, { withFab: false })).toBe(
      BOTTOM_NAV_BAR_HEIGHT + 34
    );
  });
});

describe("bottomChromeClearance", () => {
  it.each(STYLES)("never lets %s chrome cover the last row", (navStyle) => {
    for (const inset of INSETS) {
      const clearance = bottomChromeClearance(inset, { navStyle });
      const topEdge = bottomChromeTopEdge(inset, { navStyle });
      expect(clearance).toBeGreaterThanOrEqual(topEdge);
      expect(clearance - topEdge).toBe(BOTTOM_NAV_CONTENT_CLEARANCE);
    }
  });

  it("keeps the bottom-nav numbers the shell shipped with", () => {
    // 64 bar + 12 gap + 56 FAB + 24 breathing room.
    expect(bottomChromeClearance(34)).toBe(34 + 156);
  });

  it("does not pad the dock for a bar it never renders", () => {
    expect(bottomChromeClearance(34, { navStyle: "dock" })).toBe(34 + 80);
    expect(bottomChromeClearance(34, { navStyle: "dock" })).toBeLessThan(
      bottomChromeClearance(34)
    );
  });

  it("adds caller extra on top of the chrome", () => {
    expect(bottomChromeClearance(0, { extra: 20 })).toBe(
      bottomChromeClearance(0) + 20
    );
  });

  it.each(STYLES)("grows with the system inset on %s", (navStyle) => {
    expect(bottomChromeClearance(48, { navStyle })).toBeGreaterThan(
      bottomChromeClearance(0, { navStyle })
    );
  });
});
