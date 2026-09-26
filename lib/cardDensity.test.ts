import { describe, expect, it } from "vitest";

import { cardContentPadding } from "@/components/ui/cardDensity";
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
