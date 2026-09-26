import { describe, expect, it } from "vitest";

import {
  ACTION_DOCK_FAB_SIZE,
  BOTTOM_NAV_CONTENT_CLEARANCE,
  CAPSULE_FAB_GAP,
  CAPSULE_FAB_SIZE,
  CAPSULE_HEIGHT,
  CAPSULE_MIN_INSET,
  actionDockOffset,
  bottomChromeClearance,
  bottomChromeTopEdge,
  bottomNavFabOffset,
  capsuleOffset,
  capsuleRowWidth,
  navTabWidth,
  shouldCompactNavLabels,
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

  it("floats the FAB above the capsule, a fixed gap over its top (SPENDLY-172)", () => {
    for (const inset of INSETS) {
      const capsuleTop = capsuleOffset(inset) + CAPSULE_HEIGHT;
      expect(bottomNavFabOffset(inset)).toBe(capsuleTop + CAPSULE_FAB_GAP);
    }
  });

  it("floors the dock inset at the dock's own minimum", () => {
    expect(actionDockOffset(0)).toBe(16);
    expect(actionDockOffset(34)).toBe(34);
  });

  it("measures the bottom nav from the floating FAB's top", () => {
    expect(bottomChromeTopEdge(34)).toBe(bottomNavFabOffset(34) + CAPSULE_FAB_SIZE);
    expect(bottomChromeTopEdge(34)).toBe(34 + CAPSULE_HEIGHT + CAPSULE_FAB_GAP + CAPSULE_FAB_SIZE);
  });

  it("measures the dock from its FAB, since it has no bar", () => {
    expect(bottomChromeTopEdge(34, { navStyle: "dock" })).toBe(
      34 + ACTION_DOCK_FAB_SIZE
    );
  });

  it.each(STYLES)("does not shrink %s chrome when the FAB is hidden", (navStyle) => {
    // The bottom nav always renders its floating FAB and the dock's FAB is the
    // chrome, so hiding the FAB never lowers the top edge.
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
    // 68 capsule + 10 gap + 56 FAB + 24 breathing room above the inset.
    expect(bottomChromeClearance(34)).toBe(34 + 158);
    // No inset: the capsule still floats 12 above the screen edge.
    expect(bottomChromeClearance(0)).toBe(12 + 158);
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

describe("capsule tab sizing", () => {
  it("keeps five labelled tabs on a standard 390dp phone at 1× font", () => {
    expect(shouldCompactNavLabels(capsuleRowWidth(390), 5, 1)).toBe(false);
  });

  it("keeps labels on a standard phone even at the maximum font scale", () => {
    // The full-width capsule (SPENDLY-172) gives each tab ~73dp at 390dp.
    expect(shouldCompactNavLabels(capsuleRowWidth(390), 5, 1.3)).toBe(false);
  });

  it("drops labels on a 360dp phone at the maximum font scale", () => {
    expect(shouldCompactNavLabels(capsuleRowWidth(360), 5, 1.3)).toBe(true);
  });

  it("keeps labels at large font when only four tabs are shown", () => {
    expect(shouldCompactNavLabels(capsuleRowWidth(412), 4, 1.3)).toBe(false);
  });

  it("keeps labels on a narrow 320dp phone at 1× font", () => {
    expect(shouldCompactNavLabels(capsuleRowWidth(320), 5, 1)).toBe(false);
  });

  it("does not compact before the row has been measured", () => {
    expect(shouldCompactNavLabels(0, 5, 1.3)).toBe(false);
  });

  it("gives every tab a 48dp touch target from 360dp screens up", () => {
    for (const screen of [360, 390, 412, 480]) {
      expect(navTabWidth(capsuleRowWidth(screen), 5)).toBeGreaterThanOrEqual(48);
    }
    // The capsule is 68dp tall minus 8dp padding each side: 52dp.
    expect(CAPSULE_HEIGHT - 16).toBeGreaterThanOrEqual(48);
  });
});
