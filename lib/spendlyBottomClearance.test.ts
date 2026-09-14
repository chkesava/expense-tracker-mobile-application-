import { describe, expect, it } from "vitest";

import {
  BOTTOM_NAV_BAR_HEIGHT,
  BOTTOM_NAV_CONTENT_CLEARANCE,
  BOTTOM_NAV_FAB_CLEARANCE,
  BOTTOM_NAV_SCROLL_PADDING,
  BOTTOM_NAV_SCROLL_PADDING_WITH_FAB,
} from "@/components/layout/chrome";
import { spendlyBottomClearance } from "@/components/layout/spendlyBottomClearance";

describe("spendlyBottomClearance", () => {
  it("clears BottomNav + FAB + system inset by default", () => {
    const inset = 34;
    const padding = spendlyBottomClearance(inset);

    expect(padding).toBe(inset + BOTTOM_NAV_SCROLL_PADDING_WITH_FAB);
    expect(padding).toBeGreaterThanOrEqual(
      inset +
        BOTTOM_NAV_BAR_HEIGHT +
        BOTTOM_NAV_CONTENT_CLEARANCE +
        BOTTOM_NAV_FAB_CLEARANCE
    );
  });

  it("clears BottomNav + system inset when withFab is false", () => {
    const inset = 20;
    const padding = spendlyBottomClearance(inset, { withFab: false });

    expect(padding).toBe(inset + BOTTOM_NAV_SCROLL_PADDING);
    expect(padding).toBeGreaterThanOrEqual(
      inset + BOTTOM_NAV_BAR_HEIGHT + BOTTOM_NAV_CONTENT_CLEARANCE
    );
    expect(padding).toBeLessThan(inset + BOTTOM_NAV_SCROLL_PADDING_WITH_FAB);
  });

  it("adds optional extra breathing room", () => {
    expect(spendlyBottomClearance(0, { withFab: true, extra: 16 })).toBe(
      BOTTOM_NAV_SCROLL_PADDING_WITH_FAB + 16
    );
  });
});
