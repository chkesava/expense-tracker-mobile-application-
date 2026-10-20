import { describe, expect, it } from "vitest";

// components/common/sheetDensity is pure (no react-native), so its geometry is
// pinned here; Vitest only collects tests under shared/, services/ and lib/.
import { sheetBodyPadding, sheetFooterPadding, sheetGutter } from "@/components/common/sheetDensity";

describe("form sheet geometry (SPENDLY-173, SPENDLY-548)", () => {
  it("keeps every existing sheet's body padding unchanged", () => {
    expect(sheetBodyPadding("default")).toEqual({ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 });
    expect(sheetBodyPadding("compact")).toEqual({ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 });
  });

  it("lets a pinned footer supply the space below the last field", () => {
    expect(sheetBodyPadding("default", { withFooter: true }).paddingBottom).toBe(12);
    expect(sheetBodyPadding("compact", { withFooter: true }).paddingBottom).toBe(12);
  });

  it("lines the footer up with the body on the same gutter", () => {
    for (const density of ["default", "compact"] as const) {
      expect(sheetFooterPadding(density).paddingHorizontal).toBe(sheetBodyPadding(density).paddingHorizontal);
      expect(sheetFooterPadding(density).paddingHorizontal).toBe(sheetGutter(density));
    }
  });
});
