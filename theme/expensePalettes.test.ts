import { describe, expect, it } from "vitest";

import { contrastRatio, hexToRgb } from "@/components/ui/glassTokens";
import {
  ACCENT_COLOR_NAMES,
  EXPENSE_DARK_PALETTE_NAMES,
  EXPENSE_LIGHT_PALETTE_NAMES,
  EXPENSE_LIGHT_STATUS,
  EXPENSE_PALETTE_COLORS,
  EXPENSE_PALETTE_NAMES,
  EXPENSE_PALETTE_SWATCHES,
  EXPENSE_THEME_NAME,
  THEME_LABELS,
  THEME_NAMES,
  normalizeThemeMode,
  resolveThemePreference,
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
  it("offers Slate (default), Forest, Plum and Cocoa, then the six light palettes", () => {
    expect(EXPENSE_DARK_PALETTE_NAMES).toEqual(["midnight-emerald", "midnight-forest", "midnight-plum", "midnight-cocoa"]);
    expect(EXPENSE_PALETTE_NAMES).toEqual([...EXPENSE_DARK_PALETTE_NAMES, ...EXPENSE_LIGHT_PALETTE_NAMES]);
    expect(EXPENSE_PALETTE_NAMES.map((n) => THEME_LABELS[n])).toEqual([
      "Midnight Slate",
      "Midnight Forest",
      "Midnight Plum",
      "Midnight Cocoa",
      "Rose Elegance",
      "Royal Violet",
      "Ocean Blue",
      "Sunset Orange",
      "Lavender Glass",
      "Midnight Sage",
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

  describe.each(EXPENSE_DARK_PALETTE_NAMES)("%s", (name) => {
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

describe("light Expense palettes (SPENDLY-677)", () => {
  it("keeps the reference colours on the tokens they were chosen for", () => {
    const ref = (name: (typeof EXPENSE_LIGHT_PALETTE_NAMES)[number]) => EXPENSE_PALETTE_SWATCHES[name];
    for (const name of EXPENSE_LIGHT_PALETTE_NAMES) {
      const c = EXPENSE_PALETTE_COLORS[name];
      const swatch = ref(name);
      // Reference order: primary, accent, …, background (last).
      expect(c.background).toBe(swatch[swatch.length - 1]);
      expect(c.accent).toBe(swatch[1]);
      expect(c.onPrimaryContainer).toBe(swatch[0]);
    }
    expect(EXPENSE_PALETTE_COLORS["expense-rose"].primary).toBe("#6D0D3F");
    expect(EXPENSE_PALETTE_COLORS["expense-violet"].primary).toBe("#5B21B6");
    expect(EXPENSE_PALETTE_COLORS["expense-sunset"].primary).toBe("#FF7A00");
    expect(EXPENSE_PALETTE_COLORS["expense-sage"].primary).toBe("#191D23");
  });

  describe.each(EXPENSE_LIGHT_PALETTE_NAMES)("%s", (name) => {
    const c = EXPENSE_PALETTE_COLORS[name];

    it("is a known, light, accent-owning theme that ignores the accent picker", () => {
      expect(isThemeName(name)).toBe(true);
      expect(isExpensePaletteName(name)).toBe(true);
      expect(themeUsesDarkPalette(name)).toBe(false);
      expect(themeOwnsAccent(name)).toBe(true);
      for (const accent of ACCENT_COLOR_NAMES) expect(createTheme(name, accent).colors).toEqual(c);
    });

    it.each([
      ["foreground on background", "foreground", "background"],
      ["foreground on card", "foreground", "card"],
      ["muted text on card", "mutedForeground", "card"],
      ["muted text on background", "mutedForeground", "background"],
      ["muted text on raised surface", "mutedForeground", "secondary"],
      ["muted text on surface variant", "onSurfaceVariant", "surfaceVariant"],
      ["text on primary container", "onPrimaryContainer", "primaryContainer"],
      ["text on secondary container", "onSecondaryContainer", "secondaryContainer"],
      ["label on primary button", "primaryForeground", "primary"],
      ["tint text on card", "tint", "card"],
      ["active tab on background", "tabIconSelected", "background"],
      ["inactive tab icon on background", "tabIconDefault", "background"],
      ["negative values on card", "destructive", "card"],
      ["positive values on card", "success", "card"],
      ["info on card", "info", "card"],
      ["warning on card", "warning", "card"],
      ["label on destructive", "destructiveForeground", "destructive"],
      ["label on success", "successForeground", "success"],
    ] as const)("%s reads at WCAG AA", (_label, fg, bg) => {
      expect(ratio(c[fg], c[bg])).toBeGreaterThanOrEqual(4.5);
    });

    it("keeps the accent visible as a non-text mark on cards (3:1, Sunset excepted)", () => {
      // Sunset's #FF7A00 is the reference orange; its text uses the darker tint.
      if (name === "expense-sunset") expect(ratio(c.tint, c.card)).toBeGreaterThanOrEqual(4.5);
      else expect(ratio(c.accent, c.card)).toBeGreaterThanOrEqual(3);
    });

    it("shares the light money and status colours, and keeps them out of category series", () => {
      expect(c.success).toBe(EXPENSE_LIGHT_STATUS.success);
      expect(c.destructive).toBe(EXPENSE_LIGHT_STATUS.destructive);
      expect(c.warning).toBe(EXPENSE_LIGHT_STATUS.warning);
      expect(c.info).toBe(EXPENSE_LIGHT_STATUS.info);
      const chart = createTheme(name, "indigo").chart;
      expect(chart.positive).toBe(c.success);
      expect(chart.negative).toBe(c.destructive);
      expect(chart.categorical).toHaveLength(7);
      expect(chart.categorical[0]).toBe(c.accent);
      expect(chart.categorical).not.toContain(c.success);
      expect(chart.categorical).not.toContain(c.destructive);
      expect(new Set(chart.categorical).size).toBe(chart.categorical.length);
    });
  });
});

describe("theme list (SPENDLY-619)", () => {
  it("keeps only light/dark (Ganesh Seva, Nutrition) and the Expense palettes", () => {
    expect(THEME_NAMES).toEqual([
      "light",
      "dark",
      "midnight-emerald",
      "midnight-forest",
      "midnight-plum",
      "midnight-cocoa",
      "expense-rose",
      "expense-violet",
      "expense-ocean",
      "expense-sunset",
      "expense-lavender",
      "expense-sage",
    ]);
  });

  it("ignores a stored value naming a removed preset", () => {
    for (const removed of ["midnight", "midnight-olive", "cyberpunk", "sakura-bloom", "glass-3d", "claymorphism"]) {
      expect(isThemeName(removed)).toBe(false);
    }
  });
});

describe("theme mode normalisation (SPENDLY-619)", () => {
  it("turns a removed preset's custom mode into system", () => {
    expect(normalizeThemeMode("custom", "cyberpunk")).toBe("system");
    expect(normalizeThemeMode("custom", undefined)).toBe("system");
  });

  it("keeps custom for a theme that still exists, and the plain modes as they are", () => {
    expect(normalizeThemeMode("custom", "midnight-plum")).toBe("custom");
    expect(normalizeThemeMode("light", "cyberpunk")).toBe("light");
    expect(normalizeThemeMode("dark", null)).toBe("dark");
    expect(normalizeThemeMode("system", "nordic")).toBe("system");
  });

  it("rejects unknown modes", () => {
    expect(normalizeThemeMode("auto", "light")).toBeNull();
    expect(normalizeThemeMode(undefined, "light")).toBeNull();
  });
});

describe("theme preference resolution (SPENDLY-619)", () => {
  it("derives the name from the mode so they never disagree", () => {
    expect(resolveThemePreference("system", "light", "dark")).toEqual({ mode: "system", name: "dark" });
    expect(resolveThemePreference("system", "dark", "light")).toEqual({ mode: "system", name: "light" });
    // A removed preset stuck with a plain mode takes the mode's theme.
    expect(resolveThemePreference("light", "cyberpunk", "dark")).toEqual({ mode: "light", name: "light" });
    expect(resolveThemePreference("dark", "light", "light")).toEqual({ mode: "dark", name: "dark" });
  });

  it("sends a removed preset with custom mode back to the device appearance", () => {
    expect(resolveThemePreference("custom", "cyberpunk", "dark")).toEqual({ mode: "system", name: "dark" });
    expect(resolveThemePreference("custom", "nordic", null)).toEqual({ mode: "system", name: "light" });
  });

  it("keeps a valid custom theme, and a valid theme with no mode", () => {
    expect(resolveThemePreference("custom", "midnight-plum", "light")).toEqual({ mode: "custom", name: "midnight-plum" });
    expect(resolveThemePreference(undefined, "dark", "light")).toEqual({ mode: null, name: "dark" });
  });

  it("returns null when nothing usable is saved", () => {
    expect(resolveThemePreference(undefined, "cyberpunk", "dark")).toBeNull();
    expect(resolveThemePreference(null, null, "dark")).toBeNull();
  });
});
