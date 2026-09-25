import { describe, expect, it } from "vitest";

import {
  ACCENT_COLOR_NAMES,
  THEME_NAMES,
  createTheme,
  themeUsesDarkPalette,
} from "@/theme/tokens";
import {
  SMOKE_INACTIVE_ALPHA,
  SMOKE_TINT_ALPHA,
  SMOKE_TINT_ALPHA_NO_BLUR,
  SMOKE_TINT_RGB,
} from "@/components/ui/glassTokens";

/*
 * SPENDLY-165/154: the capsule nav sits on translucent "smoke" glass with
 * white content, so its labels have to hold WCAG AA (4.5:1 for small text)
 * against the glass for every theme × accent, including the lightest page
 * backdrop showing through. The tint values come from components/ui/glassTokens.
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

const WHITE: RGB = [255, 255, 255];

const COMBOS = THEME_NAMES.flatMap((name) =>
  ACCENT_COLOR_NAMES.map((accent) => [name, accent] as const)
);

describe("capsule nav contrast (smoke glass)", () => {
  // Worst realistic backdrop: the lightest surface a list can scroll under
  // the capsule (page background or card), fully showing through the blur.
  function glassOver(name: (typeof THEME_NAMES)[number], accent: (typeof ACCENT_COLOR_NAMES)[number]) {
    const t = createTheme(name, accent);
    const dark = themeUsesDarkPalette(name);
    const backdrops = [rgb(t.colors.background), rgb(t.colors.card)];
    const lightest = backdrops.sort((a, b) => luminance(b) - luminance(a))[0];
    return over(
      [...SMOKE_TINT_RGB] as RGB,
      lightest,
      dark ? SMOKE_TINT_ALPHA.dark : SMOKE_TINT_ALPHA.light
    );
  }

  it.each(COMBOS)("%s / %s: inactive labels read on the glass", (name, accent) => {
    const glass = glassOver(name, accent);
    const label = over(WHITE, glass, SMOKE_INACTIVE_ALPHA);
    expect(contrast(label, glass)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(COMBOS)("%s / %s: the active tab reads on its frosted pill", (name, accent) => {
    const pill = over(WHITE, glassOver(name, accent), 0.16);
    expect(contrast(WHITE, pill)).toBeGreaterThanOrEqual(4.5);
  });

  it("stays readable without blur", () => {
    // The no-blur fallback is denser, so it is never worse than the blurred case.
    expect(SMOKE_TINT_ALPHA_NO_BLUR).toBeGreaterThanOrEqual(SMOKE_TINT_ALPHA.light);
  });
});
