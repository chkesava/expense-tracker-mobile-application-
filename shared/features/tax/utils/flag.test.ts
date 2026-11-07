import { describe, expect, it } from "vitest";

import { taxCenterEnabled } from "./flag";

describe("taxCenterEnabled", () => {
  it("is off by default in a release build", () => {
    expect(taxCenterEnabled({}, false, "u1")).toBe(false);
  });

  it("is on in development builds", () => {
    expect(taxCenterEnabled({}, true, null)).toBe(true);
  });

  it("is on for everyone only when the switch is exactly true", () => {
    expect(taxCenterEnabled({ enableTaxCenter: true }, false, null)).toBe(true);
    expect(taxCenterEnabled({ enableTaxCenter: "true" }, false, "u1")).toBe(false);
  });

  it("is on for a listed uid only", () => {
    const system = { enableTaxCenterFor: ["u1"] };
    expect(taxCenterEnabled(system, false, "u1")).toBe(true);
    expect(taxCenterEnabled(system, false, "u2")).toBe(false);
    expect(taxCenterEnabled(system, false, null)).toBe(false);
    expect(taxCenterEnabled({ enableTaxCenterFor: "u1" }, false, "u1")).toBe(false);
  });
});
