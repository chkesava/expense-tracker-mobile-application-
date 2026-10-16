import { describe, expect, it } from "vitest";

import { donutSliceAt, nearestPointIndex, pressPoint } from "./chartHitTest";

describe("donutSliceAt", () => {
  // Ring between radius 60 and 90; slices of 25%, 25% and 50%.
  const hit = (dx: number, dy: number) => donutSliceAt(dx, dy, 60, 90, [0.25, 0.25, 0.5]);

  it("maps the four compass points onto clockwise slices from 12 o'clock", () => {
    expect(hit(1, -75)).toBe(0); // just past 12 o'clock
    expect(hit(75, 1)).toBe(1); // just past 3 o'clock
    expect(hit(-1, 75)).toBe(2); // just past 6 o'clock
    expect(hit(-75, -1)).toBe(2); // just before 12 o'clock, still the last slice
  });

  it("misses the hole and the outside of the ring", () => {
    expect(hit(0, -30)).toBeNull();
    expect(hit(0, -120)).toBeNull();
  });

  it("returns null with no slices, and the last slice when rounding leaves a sliver", () => {
    expect(donutSliceAt(0, -75, 60, 90, [])).toBeNull();
    expect(donutSliceAt(-0.0001, -75, 60, 90, [0.3333, 0.3333, 0.3333])).toBe(2);
  });
});

describe("nearestPointIndex", () => {
  it("finds the closest point, preferring the earlier on a tie", () => {
    const xs = [0, 10, 20, 30];
    expect(nearestPointIndex(-5, xs)).toBe(0);
    expect(nearestPointIndex(14, xs)).toBe(1);
    expect(nearestPointIndex(15, xs)).toBe(1);
    expect(nearestPointIndex(99, xs)).toBe(3);
  });

  it("returns -1 with no points", () => {
    expect(nearestPointIndex(3, [])).toBe(-1);
  });
});

describe("pressPoint", () => {
  it("uses native locationX/Y, falling back to web offsetX/Y", () => {
    expect(pressPoint({ locationX: 12, locationY: 34, offsetX: 1, offsetY: 2 })).toEqual({ x: 12, y: 34 });
    expect(pressPoint({ offsetX: 5, offsetY: 6 })).toEqual({ x: 5, y: 6 });
  });

  it("returns null when the event has no usable point", () => {
    expect(pressPoint({})).toBeNull();
    expect(pressPoint({ locationX: Number.NaN, locationY: 3 })).toBeNull();
  });
});
