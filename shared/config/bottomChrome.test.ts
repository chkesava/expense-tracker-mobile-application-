import { describe, expect, it } from "vitest";

import {
  ACTION_DOCK_FAB_SIZE,
  BOTTOM_NAV_CONTENT_CLEARANCE,
  CAPSULE_FAB_SIZE,
  CAPSULE_HEIGHT,
  CAPSULE_MIN_INSET,
  actionDockOffset,
  bottomChromeClearance,
  bottomChromeTopEdge,
  bottomNavFabOffset,
  capsuleOffset,
  type BottomNavStyle,
} from "@/shared/config/bottomChrome";

/** Gesture bar, three-button nav, notchless Android, tall iPhone, web. */
const INSETS = [0, 8, 16, 24, 34, 48];
const STYLES: BottomNavStyle[] = ["bottom", "dock"];

describe("bottom chrome geometry", () => {
  it("floats the capsule above the system inset, never flush", () => {
    expect(capsuleOffset(0)).toBe(CAPSULE_MIN_INSET);
    expect(capsuleOffset(34)).toBe(34);
  });

  it("centres the FAB on the capsule rather than stacking it above", () => {
    for (const inset of INSETS) {
      const fabBottom = bottomNavFabOffset(inset);
      const fabTop = fabBottom + CAPSULE_FAB_SIZE;
      expect(fabBottom).toBeGreaterThanOrEqual(capsuleOffset(inset));
      expect(fabTop).toBeLessThanOrEqual(capsuleOffset(inset) + CAPSULE_HEIGHT);
    }
  });

  it("floors the dock inset at the dock's own minimum", () => {
    expect(actionDockOffset(0)).toBe(16);
    expect(actionDockOffset(34)).toBe(34);
  });

  it("measures the bottom nav from the capsule's top", () => {
    expect(bottomChromeTopEdge(34)).toBe(34 + CAPSULE_HEIGHT);
  });

  it("measures the dock from its FAB, since it has no bar", () => {
    expect(bottomChromeTopEdge(34, { navStyle: "dock" })).toBe(
      34 + ACTION_DOCK_FAB_SIZE
    );
  });

  it.each(STYLES)("does not shrink %s chrome when the FAB is hidden", (navStyle) => {
    // The capsule's FAB sits beside it and the dock's FAB is the chrome, so
    // hiding the FAB never lowers the top edge.
    expect(bottomChromeTopEdge(0, { navStyle, withFab: false })).toBe(
      bottomChromeTopEdge(0, { navStyle })
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

  it("pins the capsule numbers", () => {
    // 64 capsule + 24 breathing room above the inset.
    expect(bottomChromeClearance(34)).toBe(34 + 88);
    // No inset: the capsule still floats 12 above the screen edge.
    expect(bottomChromeClearance(0)).toBe(12 + 88);
  });

  it("keeps the dock below the capsule's reach", () => {
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
