import { describe, expect, it } from "vitest";

import { contrastRatio, hexToRgb } from "@/components/ui/glassTokens";
import {
  ACCENT_COLOR_NAMES,
  createTheme,
  isThemeName,
  midnightEmeraldColors,
  themeOwnsAccent,
  themeUsesDarkPalette,
} from "@/theme/tokens";

const ratio = (a: string, b: string) => contrastRatio(hexToRgb(a), hexToRgb(b));

describe("Midnight Emerald theme (SPENDLY-532)", () => {
  it("is a known, dark, accent-owning preset", () => {
    expect(isThemeName("midnight-emerald")).toBe(true);
    expect(themeUsesDarkPalette("midnight-emerald")).toBe(true);
    expect(themeOwnsAccent("midnight-emerald")).toBe(true);
    expect(themeOwnsAccent("dark")).toBe(false);
  });

  it("ignores the accent picker", () => {
    for (const accent of ACCENT_COLOR_NAMES) {
      expect(createTheme("midnight-emerald", accent).colors).toEqual(midnightEmeraldColors);
    }
  });

  it("leaves the light and dark palettes untouched", () => {
    expect(createTheme("dark", "indigo").colors.primary).toBe("#6B63FF");
    expect(createTheme("light", "indigo").colors.background).toBe("#F7F9FC");
  });

  const c = midnightEmeraldColors;

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
  ])("%s reads at WCAG AA", (_label, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
