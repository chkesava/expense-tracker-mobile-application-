import { describe, expect, it } from "vitest";

import { cardContentPadding } from "@/components/ui/cardDensity";
import { sheetBodyPadding } from "@/components/common/sheetDensity";
import { space } from "@/theme/tokens";

describe("cardContentPadding (SPENDLY-173)", () => {
  it("keeps every existing card exactly as it was", () => {
    expect(cardContentPadding("default", space)).toEqual({ padding: 16 });
  });

  it("gives compact cards token padding, half the old 32dp stack at the sides", () => {
    expect(cardContentPadding("compact", space)).toEqual({
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
    });
    expect(space.lg).toBe(16);
    expect(space.md).toBe(12);
  });
});

describe("sheetBodyPadding (SPENDLY-173)", () => {
  it("keeps every existing sheet exactly as it was", () => {
    expect(sheetBodyPadding("default")).toEqual({ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 });
  });

  it("uses the standard 16dp gutter for compact sheets", () => {
    expect(sheetBodyPadding("compact").paddingHorizontal).toBe(space.lg);
  });
});
