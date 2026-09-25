import { describe, expect, it } from "vitest";

import {
  BOTTOM_NAV_CONTENT_CLEARANCE,
  CAPSULE_FAB_SIZE,
  CAPSULE_HEIGHT,
  CAPSULE_MIN_INSET,
  bottomNavFabOffset,
  capsuleOffset,
} from "@/components/layout/chrome";
import {
  resolveListBottomPadding,
  spendlyBottomClearance,
} from "@/components/layout/spendlyBottomClearance";

describe("spendlyBottomClearance", () => {
  it("clears the capsule + system inset by default", () => {
    const inset = 34;
    expect(spendlyBottomClearance(inset)).toBe(
      inset + CAPSULE_HEIGHT + BOTTOM_NAV_CONTENT_CLEARANCE
    );
  });

  it("is unchanged when the FAB is hidden, since the FAB sits beside the capsule", () => {
    expect(spendlyBottomClearance(20, { withFab: false })).toBe(
      spendlyBottomClearance(20)
    );
  });

  it("adds optional extra breathing room", () => {
    // A zero system inset is floored at the capsule's minimum float height.
    expect(spendlyBottomClearance(0, { withFab: true, extra: 16 })).toBe(
      CAPSULE_MIN_INSET + CAPSULE_HEIGHT + BOTTOM_NAV_CONTENT_CLEARANCE + 16
    );
  });
});

describe("resolveListBottomPadding", () => {
  it("reuses the PageShell clearance when the shell hands it to the list", () => {
    expect(resolveListBottomPadding(190, 34)).toBe(190);
    expect(resolveListBottomPadding(190, 34, 12)).toBe(202);
  });

  it("falls back to capsule clearance outside a list-owning PageShell", () => {
    expect(resolveListBottomPadding(null, 34)).toBe(
      spendlyBottomClearance(34, { withFab: true })
    );
    expect(resolveListBottomPadding(null, 0, 20)).toBe(
      CAPSULE_MIN_INSET + CAPSULE_HEIGHT + BOTTOM_NAV_CONTENT_CLEARANCE + 20
    );
  });

  it("lets the last row scroll above both the capsule and the FAB", () => {
    for (const inset of [0, 16, 34, 48]) {
      const capsuleTop = capsuleOffset(inset) + CAPSULE_HEIGHT;
      const fabTop = bottomNavFabOffset(inset) + CAPSULE_FAB_SIZE;
      const padding = resolveListBottomPadding(null, inset);
      expect(padding).toBeGreaterThan(capsuleTop);
      expect(padding).toBeGreaterThan(fabTop);
    }
  });
});
