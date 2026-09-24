import { describe, expect, it } from "vitest";

import {
  BOTTOM_NAV_BAR_HEIGHT,
  BOTTOM_NAV_CONTENT_CLEARANCE,
  BOTTOM_NAV_FAB_CLEARANCE,
  BOTTOM_NAV_FAB_GAP,
  BOTTOM_NAV_FAB_SIZE,
  BOTTOM_NAV_SCROLL_PADDING,
  BOTTOM_NAV_SCROLL_PADDING_WITH_FAB,
} from "@/components/layout/chrome";
import {
  resolveListBottomPadding,
  spendlyBottomClearance,
} from "@/components/layout/spendlyBottomClearance";

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

describe("resolveListBottomPadding", () => {
  it("reuses the PageShell clearance when the shell hands it to the list", () => {
    expect(resolveListBottomPadding(190, 34)).toBe(190);
    expect(resolveListBottomPadding(190, 34, 12)).toBe(202);
  });

  it("falls back to nav + FAB clearance outside a list-owning PageShell", () => {
    expect(resolveListBottomPadding(null, 34)).toBe(
      spendlyBottomClearance(34, { withFab: true })
    );
    expect(resolveListBottomPadding(null, 0, 20)).toBe(
      BOTTOM_NAV_SCROLL_PADDING_WITH_FAB + 20
    );
  });

  it("lets the last row scroll above the top edge of the FAB", () => {
    for (const inset of [0, 16, 34, 48]) {
      const fabTopFromBottom =
        inset + BOTTOM_NAV_BAR_HEIGHT + BOTTOM_NAV_FAB_GAP + BOTTOM_NAV_FAB_SIZE;
      expect(resolveListBottomPadding(null, inset)).toBeGreaterThan(fabTopFromBottom);
    }
  });
});
