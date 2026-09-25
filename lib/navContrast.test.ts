import { describe, expect, it } from "vitest";

import {
  ACCENT_COLOR_NAMES,
  THEME_NAMES,
  createTheme,
  themeUsesDarkPalette,
} from "@/theme/tokens";

/*
 * SPENDLY-165: the capsule nav sits on translucent glass, so its label
 * colours have to hold WCAG AA (4.5:1 for small text) against the glass tint
 * for every theme × accent. The tint alphas mirror GlassSurface's overlay.
 */

type RGB = [number, number, number];

function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: RGB): number {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function over(fg: RGB, bg: RGB, alpha: number): RGB {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as RGB;
}

const COMBOS = THEME_NAMES.flatMap((name) =>
  ACCENT_COLOR_NAMES.map((accent) => [name, accent] as const)
);

describe("capsule nav contrast", () => {
  it.each(COMBOS)("%s / %s: inactive labels read on the glass", (name, accent) => {
    const t = createTheme(name, accent);
    const dark = themeUsesDarkPalette(name);
    // Worst realistic backdrop: the page background showing through the tint.
    const glass = over(rgb(t.colors.card), rgb(t.colors.background), dark ? 0.6 : 0.72);
    expect(contrast(rgb(t.colors.mutedForeground), glass)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(COMBOS)("%s / %s: the active tab reads on its pill", (name, accent) => {
    const t = createTheme(name, accent);
    expect(
      contrast(rgb(t.colors.onPrimaryContainer), rgb(t.colors.primaryContainer))
    ).toBeGreaterThanOrEqual(4.5);
  });
});
