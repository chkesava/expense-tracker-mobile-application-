import { describe, expect, it } from "vitest";

import {
  ACCENT_COLOR_NAMES,
  EXPENSE_THEME_NAME,
  THEME_NAMES,
  createTheme,
  themeOwnsAccent,
  themeUsesDarkPalette,
} from "@/theme/tokens";

// SPENDLY-604: the Expense shell pins one palette for every screen.
describe("EXPENSE_THEME_NAME (SPENDLY-604)", () => {
  it("is the dashboard's Midnight Emerald, a real dark preset", () => {
    expect(EXPENSE_THEME_NAME).toBe("midnight-emerald");
    expect(THEME_NAMES).toContain(EXPENSE_THEME_NAME);
    expect(themeUsesDarkPalette(EXPENSE_THEME_NAME)).toBe(true);
  });

  it("looks the same whatever accent the user saved, so no screen can drift", () => {
    expect(themeOwnsAccent(EXPENSE_THEME_NAME)).toBe(true);
    const base = createTheme(EXPENSE_THEME_NAME, ACCENT_COLOR_NAMES[0]).colors;
    for (const accent of ACCENT_COLOR_NAMES) {
      expect(createTheme(EXPENSE_THEME_NAME, accent).colors).toEqual(base);
    }
  });
});
