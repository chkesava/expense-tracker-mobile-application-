import { describe, expect, it } from "vitest";

import { contrastRatio, hexToRgb } from "@/components/ui/glassTokens";
import {
  ACCENT_COLOR_NAMES,
  createTheme,
  isThemeName,
  THEME_LABELS,
  midnightSlateColors,
  themeOwnsAccent,
  themeUsesDarkPalette,
} from "@/theme/tokens";

const ratio = (a: string, b: string) => contrastRatio(hexToRgb(a), hexToRgb(b));

describe("Midnight Slate theme (SPENDLY-617, was Midnight Emerald SPENDLY-532)", () => {
  it("is a known, dark, accent-owning preset", () => {
    expect(isThemeName("midnight-emerald")).toBe(true);
    expect(themeUsesDarkPalette("midnight-emerald")).toBe(true);
    expect(themeOwnsAccent("midnight-emerald")).toBe(true);
    expect(themeOwnsAccent("dark")).toBe(false);
  });

  it("ignores the accent picker", () => {
    for (const accent of ACCENT_COLOR_NAMES) {
      expect(createTheme("midnight-emerald", accent).colors).toEqual(midnightSlateColors);
    }
  });

  it("leaves the light and dark palettes untouched", () => {
    expect(createTheme("dark", "indigo").colors.primary).toBe("#6B63FF");
    expect(createTheme("light", "indigo").colors.background).toBe("#F7F9FC");
  });

  const c = midnightSlateColors;

  it.each([
    ["foreground on background", c.foreground, c.background],
    ["foreground on card", c.foreground, c.card],
    ["muted text on card", c.mutedForeground, c.card],
    ["muted text on secondary card", c.mutedForeground, c.secondary],
    ["negative values on card", c.destructive, c.card],
    ["positive values on card", c.success, c.card],
    ["accent text on card", c.primary, c.card],
    ["info on card", c.info, c.card],
    ["label on primary button", c.primaryForeground, c.primary],
    ["text on primary container", c.onPrimaryContainer, c.primaryContainer],
    ["text on secondary container", c.onSecondaryContainer, c.secondaryContainer],
    ["secondary text on surface variant", c.onSurfaceVariant, c.surfaceVariant],
    ["inactive tab icon on background", c.tabIconDefault, c.background],
  ])("%s reads at WCAG AA", (_label, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("uses the six slate colours for every non-semantic token", () => {
    const SLATE = ["#06141B", "#11212D", "#1A2B38", "#253745", "#4A5C6A", "#9BA8AB", "#CCD0CF"];
    const semantic = new Set([
      "destructive", "destructiveForeground", "success", "successForeground",
      "warning", "warningForeground", "info", "infoForeground", "scrim",
    ]);
    for (const [token, value] of Object.entries(c)) {
      if (!semantic.has(token)) expect(SLATE, token).toContain(value);
    }
    expect(c.background).toBe("#06141B");
    expect(c.card).toBe("#11212D");
    expect(c.foreground).toBe("#CCD0CF");
    expect(c.mutedForeground).toBe("#9BA8AB");
  });

  it("keeps green and red for money meaning only", () => {
    const theme = createTheme("midnight-emerald", "indigo");
    expect(c.success).toBe("#35E889");
    expect(c.destructive).toBe("#FF7777");
    expect(c.primary).not.toBe(c.success);
    expect(theme.chart.positive).toBe(c.success);
    expect(theme.chart.negative).toBe(c.destructive);
    // Category series are neutral: no gain/loss colours among them.
    expect(theme.chart.categorical).not.toContain(c.success);
    expect(theme.chart.categorical).not.toContain(c.destructive);
    expect(new Set(theme.chart.categorical).size).toBe(theme.chart.categorical.length);
  });

  it("keeps #4A5C6A to lines: it never colours text or icons", () => {
    const textTokens = [
      c.foreground, c.cardForeground, c.mutedForeground, c.secondaryForeground,
      c.onPrimaryContainer, c.onSecondaryContainer, c.onSurfaceVariant,
      c.tabIconDefault, c.tabIconSelected,
    ];
    expect(textTokens).not.toContain("#4A5C6A");
    expect(c.outline).toBe("#4A5C6A");
  });

  it("labels the preset Midnight Slate", () => {
    expect(THEME_LABELS["midnight-emerald"]).toBe("Midnight Slate");
  });
});
