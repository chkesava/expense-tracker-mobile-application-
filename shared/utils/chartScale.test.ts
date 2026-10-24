import { describe, expect, it } from "vitest";

import { niceAxisMax } from "./chartScale";

describe("niceAxisMax", () => {
  it("rounds the top up to four round steps", () => {
    expect(niceAxisMax(16122)).toBe(20000);
    expect(niceAxisMax(5852)).toBe(8000);
    expect(niceAxisMax(11000)).toBe(12000);
    expect(niceAxisMax(26)).toBe(40);
    expect(niceAxisMax(3)).toBe(4);
  });

  it("keeps headroom above the tallest value", () => {
    expect(niceAxisMax(20000)).toBeGreaterThan(20000);
    expect(niceAxisMax(0.4)).toBeGreaterThanOrEqual(0.42);
  });

  it("honours the interval count", () => {
    expect(niceAxisMax(16122, 2)).toBe(20000);
    expect(niceAxisMax(9000, 2)).toBe(10000);
  });

  it("falls back to a unit scale with nothing to draw", () => {
    expect(niceAxisMax(0)).toBe(4);
    expect(niceAxisMax(Number.NaN, 2)).toBe(2);
  });
});
