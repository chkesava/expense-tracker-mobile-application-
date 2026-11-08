import { describe, expect, it } from "vitest";

import {
  DASHBOARD_MAX,
  contentMaxWidthOf,
  gridColumnsOf,
  isDesktopDashboard,
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

  it("gives the dashboard its desktop cap only at expanded (SPENDLY-718)", () => {
    expect(contentMaxWidthOf("compact", "dashboard")).toBeUndefined();
    expect(contentMaxWidthOf("medium", "dashboard")).toBe(960);
    expect(contentMaxWidthOf("expanded", "dashboard")).toBe(DASHBOARD_MAX);
    // A 1920 monitor's page column (1920 - 232 sidebar) fits under the cap.
    expect(DASHBOARD_MAX).toBeLessThanOrEqual(1920 - 232);
  });
});

describe("isDesktopDashboard (SPENDLY-718)", () => {
  it("switches to the desktop composition at 1280 on web", () => {
    expect(isDesktopDashboard(1279, true)).toBe(false);
    expect(isDesktopDashboard(1280, true)).toBe(true);
    expect(isDesktopDashboard(1920, true)).toBe(true);
  });

  it("keeps tablet and the small desktop on the existing grid", () => {
    expect(isDesktopDashboard(768, true)).toBe(false);
    expect(isDesktopDashboard(1024, true)).toBe(false);
  });

  it("never applies on native", () => {
    expect(isDesktopDashboard(1920, false)).toBe(false);
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
