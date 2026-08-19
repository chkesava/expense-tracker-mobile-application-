import { describe, expect, it } from "vitest";

import {
  isSettingsSectionId,
  SETTINGS_SECTION_IDS,
  SETTINGS_SECTIONS,
  settingsSectionHref,
} from "./settingsNav";

describe("settingsNav", () => {
  it("covers every section id in the catalog", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.id)).toEqual([
      ...SETTINGS_SECTION_IDS,
    ]);
  });

  it("accepts known section ids only", () => {
    expect(isSettingsSectionId("privacy")).toBe(true);
    expect(isSettingsSectionId("nope")).toBe(false);
    expect(isSettingsSectionId(undefined)).toBe(false);
  });

  it("builds nested settings hrefs", () => {
    expect(settingsSectionHref("appearance")).toBe("/settings/appearance");
    expect(settingsSectionHref("money")).toBe("/settings/money");
  });
});
