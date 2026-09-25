import { describe, expect, it } from "vitest";

import {
  ACCENT_COLOR_NAMES,
  THEME_NAMES,
  createTheme,
  themeUsesDarkPalette,
} from "@/theme/tokens";
import {
  SMOKE_ACTIVE_PILL_ALPHA,
  SMOKE_INACTIVE_ALPHA,
  SMOKE_INACTIVE_ICON_ALPHA,
  SMOKE_TINT_ALPHA,
  SMOKE_TINT_ALPHA_NO_BLUR,
  SMOKE_TINT_RGB,
  contrastRatio as contrast,
  glassAccent,
  smokeActivePill,
  hexToRgb as rgb,
  luminance,
  over,
  type RGB,
} from "@/components/ui/glassTokens";

/*
 * SPENDLY-165/154/170: the capsule nav sits on translucent "smoke" glass with
 * white content and an accent-coloured active tab, so its labels have to hold
 * WCAG AA (4.5:1 for small text) against the glass for every theme × accent,
 * including the lightest page backdrop showing through. The tint values come
 * from components/ui/glassTokens.
 */

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

  it.each(COMBOS)("%s / %s: inactive icons read on the glass", (name, accent) => {
    const glass = glassOver(name, accent);
    const icon = over(WHITE, glass, SMOKE_INACTIVE_ICON_ALPHA);
    expect(contrast(icon, glass)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(COMBOS)("%s / %s: the accent active tab reads on its frosted pill", (name, accent) => {
    const t = createTheme(name, accent);
    const pill = over(WHITE, glassOver(name, accent), SMOKE_ACTIVE_PILL_ALPHA);
    // BottomNav's pill model must agree with this test's independent one.
    const navPill = smokeActivePill([t.colors.background, t.colors.card], themeUsesDarkPalette(name));
    expect(navPill).toEqual(pill);
    expect(contrast(rgb(glassAccent(t.colors.primary, navPill)), pill)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps an accent that already reads, and only lightens the ones that don't", () => {
    const pill = smokeActivePill(["#FFFFFF"], false);
    const lifted = glassAccent("#4F46FF", pill);
    // A colour that already passes comes back untouched.
    expect(glassAccent(lifted, pill)).toBe(lifted);
    expect(lifted).not.toBe("#4F46FF");
    expect(luminance(rgb(lifted))).toBeGreaterThan(luminance(rgb("#4F46FF")));
  });

  it("stays readable without blur", () => {
    // The no-blur fallback is denser, so it is never worse than the blurred case.
    expect(SMOKE_TINT_ALPHA_NO_BLUR).toBeGreaterThanOrEqual(SMOKE_TINT_ALPHA.light);
  });
});
