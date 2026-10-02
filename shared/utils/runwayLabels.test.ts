import { describe, expect, it } from "vitest";

import { RUNWAY_RESOURCE_KINDS } from "../types/runway";
import { RUNWAY_KIND_LABELS, canToggleRunwayResource, isRunwayDefault, runwayReasonText } from "./runwayLabels";

describe("runway labels", () => {
  it("labels every kind", () => {
    for (const k of RUNWAY_RESOURCE_KINDS) expect(RUNWAY_KIND_LABELS[k].length).toBeGreaterThan(0);
  });

  it("explains every reason in order", () => {
    expect(runwayReasonText({ reasons: ["near_liquid_excluded", "user_included"] })).toMatch(/^Fixed deposits.*You chose to count this/);
  });

  it("locks the switch for locked kinds and other currencies", () => {
    expect(canToggleRunwayResource({ overridable: true, reasons: ["liquid_by_default"] })).toBe(true);
    expect(canToggleRunwayResource({ overridable: false, reasons: ["restricted_excluded"] })).toBe(false);
    expect(canToggleRunwayResource({ overridable: true, reasons: ["liquid_by_default", "currency_unsupported"] })).toBe(false);
  });

  it("knows when a choice is back to the default", () => {
    expect(isRunwayDefault({ liquidity: "liquid" }, true)).toBe(true);
    expect(isRunwayDefault({ liquidity: "near_liquid" }, true)).toBe(false);
    expect(isRunwayDefault({ liquidity: "near_liquid" }, false)).toBe(true);
  });
});
