import { describe, expect, it } from "vitest";

import {
  breakpointOf,
  ganeshMaxWidthOf,
  statStripColumnsOf,
} from "./ganeshBreakpoint";

describe("breakpointOf", () => {
  it("treats phones and narrow web as compact", () => {
    expect(breakpointOf(320)).toBe("compact");
    expect(breakpointOf(375)).toBe("compact");
    expect(breakpointOf(599)).toBe("compact");
  });

  it("opens medium at 600 and holds it through 1023", () => {
    expect(breakpointOf(600)).toBe("medium");
    expect(breakpointOf(768)).toBe("medium");
    expect(breakpointOf(1023)).toBe("medium");
  });

  it("opens expanded at 1024", () => {
    expect(breakpointOf(1024)).toBe("expanded");
    expect(breakpointOf(1440)).toBe("expanded");
  });
});

describe("ganeshMaxWidthOf", () => {
  it("caps compact and medium web at 720, expanded at 1100", () => {
    expect(ganeshMaxWidthOf("compact")).toBe(720);
    expect(ganeshMaxWidthOf("medium")).toBe(720);
    expect(ganeshMaxWidthOf("expanded")).toBe(1100);
  });
});

describe("statStripColumnsOf", () => {
  it("grows the tile row with the breakpoint", () => {
    expect(statStripColumnsOf("compact")).toBe(2);
    expect(statStripColumnsOf("medium")).toBe(3);
    expect(statStripColumnsOf("expanded")).toBe(4);
  });
});
