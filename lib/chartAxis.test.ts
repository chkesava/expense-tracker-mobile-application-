import { describe, expect, it } from "vitest";

import { compactAxisValue } from "@/components/charts/axis";

/** PR #239 review — small axis steps keep their decimal, so gridlines stay distinct. */
describe("compactAxisValue", () => {
  it("keeps one decimal below 1000 for non-integer steps", () => {
    expect([0, 2.5, 5, 7.5, 10].map(compactAxisValue)).toEqual(["0", "2.5", "5", "7.5", "10"]);
    expect([0.3, 0.6, 0.9, 1.2].map(compactAxisValue)).toEqual(["0.3", "0.6", "0.9", "1.2"]);
  });

  it("keeps whole numbers and the K / M forms unchanged", () => {
    expect(compactAxisValue(250)).toBe("250");
    expect(compactAxisValue(5000)).toBe("5K");
    expect(compactAxisValue(12_500)).toBe("13K");
    expect(compactAxisValue(1_200_000)).toBe("1.2M");
  });
});
