import { describe, expect, it } from "vitest";

import {
  contentMaxWidthOf,
  gridColumnsOf,
  layoutOf,
  sheetPresentationOf,
  sidebarVisible,
} from "./responsiveLayout";

describe("layoutOf", () => {
  it("keeps phones and narrow web compact", () => {
    expect(layoutOf(320, true)).toBe("compact");
    expect(layoutOf(480, true)).toBe("compact");
    expect(layoutOf(767, true)).toBe("compact");
  });

  it("opens medium at 768 and holds it through 1023", () => {
    expect(layoutOf(768, true)).toBe("medium");
    expect(layoutOf(1023, true)).toBe("medium");
  });

  it("opens expanded at 1024", () => {
    expect(layoutOf(1024, true)).toBe("expanded");
    expect(layoutOf(1366, true)).toBe("expanded");
    expect(layoutOf(1440, true)).toBe("expanded");
  });

  it("never widens native, whatever the screen", () => {
    expect(layoutOf(390, false)).toBe("compact");
    expect(layoutOf(800, false)).toBe("compact");
    expect(layoutOf(1280, false)).toBe("compact");
  });
});

describe("contentMaxWidthOf", () => {
  it("leaves compact uncapped so the phone layout is unchanged", () => {
    expect(contentMaxWidthOf("compact")).toBeUndefined();
    expect(contentMaxWidthOf("compact", "readable")).toBeUndefined();
  });

  it("widens the wide cap with the layout", () => {
    expect(contentMaxWidthOf("medium")).toBe(960);
    expect(contentMaxWidthOf("expanded")).toBe(1280);
  });

  it("keeps readable content at one width above compact", () => {
    expect(contentMaxWidthOf("medium", "readable")).toBe(720);
    expect(contentMaxWidthOf("expanded", "readable")).toBe(720);
  });
});

describe("gridColumnsOf", () => {
  it("is one column on compact", () => {
    expect(gridColumnsOf("compact")).toBe(1);
  });

  it("is two on medium and three on expanded", () => {
    expect(gridColumnsOf("medium")).toBe(2);
    expect(gridColumnsOf("expanded")).toBe(3);
  });

  it("respects a caller's column limit", () => {
    expect(gridColumnsOf("expanded", 2)).toBe(2);
    expect(gridColumnsOf("medium", 1)).toBe(1);
  });
});

describe("chrome switches", () => {
  it("shows the sidebar only at expanded", () => {
    expect(sidebarVisible("compact")).toBe(false);
    expect(sidebarVisible("medium")).toBe(false);
    expect(sidebarVisible("expanded")).toBe(true);
  });

  it("presents sheets as dialogs above compact", () => {
    expect(sheetPresentationOf("compact")).toBe("sheet");
    expect(sheetPresentationOf("medium")).toBe("dialog");
    expect(sheetPresentationOf("expanded")).toBe("dialog");
  });
});
