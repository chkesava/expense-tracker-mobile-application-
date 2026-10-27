import { describe, expect, it } from "vitest";

import { contrastRatio, hexToRgb } from "@/components/ui/glassTokens";
import {
  ACCENT_COLOR_NAMES,
  EXPENSE_PALETTE_COLORS,
  EXPENSE_PALETTE_NAMES,
  EXPENSE_PALETTE_SWATCHES,
  EXPENSE_THEME_NAME,
  THEME_LABELS,
  createTheme,
  expensePaletteColors,
  isExpensePaletteName,
  isThemeName,
  midnightSlateColors,
  resolveExpensePalette,
  themeOwnsAccent,
  themeUsesDarkPalette,
} from "@/theme/tokens";

const ratio = (a: string, b: string) => contrastRatio(hexToRgb(a), hexToRgb(b));

describe("Expense palettes (SPENDLY-618)", () => {
  it("offers Slate (default), Forest, Plum and Cocoa", () => {
    expect(EXPENSE_PALETTE_NAMES).toEqual(["midnight-emerald", "midnight-forest", "midnight-plum", "midnight-cocoa"]);
    expect(EXPENSE_PALETTE_NAMES.map((n) => THEME_LABELS[n])).toEqual([
      "Midnight Slate",
      "Midnight Forest",
      "Midnight Plum",
      "Midnight Cocoa",
    ]);
    expect(EXPENSE_PALETTE_NAMES[0]).toBe(EXPENSE_THEME_NAME);
  });

  it("falls back to Slate for a missing or unknown stored value", () => {
    expect(resolveExpensePalette(null)).toBe("midnight-emerald");
    expect(resolveExpensePalette("dark")).toBe("midnight-emerald");
    expect(resolveExpensePalette("midnight-plum")).toBe("midnight-plum");
    expect(isExpensePaletteName("light")).toBe(false);
  });

  it("builds Slate exactly as SPENDLY-617 shipped it", () => {
    expect(
      expensePaletteColors({
        background: "#06141B",
        card: "#11212D",
        step: "#1A2B38",
        raised: "#253745",
        edge: "#253745",
        line: "#4A5C6A",
        mutedText: "#9BA8AB",
        text: "#CCD0CF",
      })
    ).toEqual(midnightSlateColors);
  });

  describe.each(EXPENSE_PALETTE_NAMES)("%s", (name) => {
    const c = EXPENSE_PALETTE_COLORS[name];
    const swatch = EXPENSE_PALETTE_SWATCHES[name];

    it("is a known, dark, accent-owning theme that ignores the accent picker", () => {
      expect(isThemeName(name)).toBe(true);
      expect(themeUsesDarkPalette(name)).toBe(true);
      expect(themeOwnsAccent(name)).toBe(true);
      for (const accent of ACCENT_COLOR_NAMES) expect(createTheme(name, accent).colors).toEqual(c);
    });

    it.each([
      ["foreground on background", "foreground", "background"],
      ["foreground on card", "foreground", "card"],
      ["muted text on card", "mutedForeground", "card"],
      ["muted text on raised surface", "mutedForeground", "secondary"],
      ["muted text on surface variant", "onSurfaceVariant", "surfaceVariant"],
      ["text on primary container", "onPrimaryContainer", "primaryContainer"],
      ["text on secondary container", "onSecondaryContainer", "secondaryContainer"],
      ["label on primary button", "primaryForeground", "primary"],
      ["inactive tab icon on background", "tabIconDefault", "background"],
      ["negative values on card", "destructive", "card"],
      ["positive values on card", "success", "card"],
      ["info on card", "info", "card"],
      ["warning on card", "warning", "card"],
    ] as const)("%s reads at WCAG AA", (_label, fg, bg) => {
      expect(ratio(c[fg], c[bg])).toBeGreaterThanOrEqual(4.5);
    });

    it("takes its surfaces and text from its own six colours", () => {
      expect(c.background).toBe(swatch[0]);
      expect(c.card).toBe(swatch[1]);
      expect(c.outline).toBe(swatch[3]);
      expect(c.mutedForeground).toBe(swatch[4]);
      expect(c.foreground).toBe(swatch[5]);
      expect(c.primary).toBe(swatch[5]);
    });

    it("keeps the line colour off text and icons", () => {
      const text = [c.foreground, c.mutedForeground, c.onSurfaceVariant, c.tabIconDefault, c.tabIconSelected];
      expect(text).not.toContain(c.outline);
    });

    it("shares the money and status colours, and keeps them out of category series", () => {
      expect(c.success).toBe("#35E889");
      expect(c.destructive).toBe("#FF7777");
      expect(c.primary).not.toBe(c.success);
      const chart = createTheme(name, "indigo").chart;
      expect(chart.positive).toBe(c.success);
      expect(chart.negative).toBe(c.destructive);
      expect(chart.categorical).not.toContain(c.success);
      expect(chart.categorical).not.toContain(c.destructive);
      expect(chart.categorical).toContain(c.foreground);
      expect(new Set(chart.categorical).size).toBe(chart.categorical.length);
    });
  });
});
