import { describe, expect, it } from "vitest";

import {
  ACCENT_COLOR_NAMES,
  THEME_NAMES,
  createTheme,
  themeUsesDarkPalette,
} from "@/theme/tokens";
import {
  SMOKE_INACTIVE_ALPHA,
  SMOKE_INACTIVE_ICON_ALPHA,
  SMOKE_BLUR_RADIUS_DP,
  SMOKE_BLUR_TINT,
  SMOKE_GLOSS_ALPHA,
  smokeAndroidBlur,
  SMOKE_TINT_ALPHA,
  SMOKE_TINT_ALPHA_NO_BLUR,
  SMOKE_TINT_RGB,
  contrastRatio as contrast,
  glassAccent,
  smokeActiveLens,
  smokeActivePill,
  smokeLensFor,
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
    // The blur layer's own dark tint (counted conservatively), then ours.
    const blurred = over([...SMOKE_BLUR_TINT.rgb] as RGB, lightest, SMOKE_BLUR_TINT.alpha);
    return over(
      [...SMOKE_TINT_RGB] as RGB,
      blurred,
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

  // The lens is a tint over the glass, modelled at its brighter top stop:
  // blue/purple in every theme (SPENDLY-172), emerald in Midnight Emerald
  // (SPENDLY-533).
  const lensTop = (name: (typeof THEME_NAMES)[number]) => smokeLensFor(name).top;

  it.each(COMBOS)("%s / %s: the accent active tab reads on its lens", (name, accent) => {
    const t = createTheme(name, accent);
    const top = lensTop(name);
    const pill = over([...top.rgb] as RGB, glassOver(name, accent), top.alpha);
    // BottomNav's pill model must agree with this test's independent one.
    const navPill = smokeActivePill(
      [t.colors.background, t.colors.card],
      themeUsesDarkPalette(name),
      smokeLensFor(name)
    );
    expect(navPill).toEqual(pill);
    expect(contrast(rgb(glassAccent(t.colors.primary, navPill)), pill)).toBeGreaterThanOrEqual(4.5);
  });

  // Icons sit in the top gloss band. WCAG asks 3:1 for graphics; check them
  // at the brightest point of the gloss.
  it.each(COMBOS)("%s / %s: icons read inside the top gloss", (name, accent) => {
    const t = createTheme(name, accent);
    const glossed = over(WHITE, glassOver(name, accent), SMOKE_GLOSS_ALPHA);
    const icon = over(WHITE, glossed, SMOKE_INACTIVE_ICON_ALPHA);
    expect(contrast(icon, glossed)).toBeGreaterThanOrEqual(3);
    const top = lensTop(name);
    const lens = over([...top.rgb] as RGB, glossed, top.alpha);
    const backdrops = [t.colors.background, t.colors.card];
    const dark = themeUsesDarkPalette(name);
    const navLens = smokeActiveLens(backdrops, dark, smokeLensFor(name));
    expect(navLens).toEqual(lens);
    const accentColor = glassAccent(
      t.colors.primary,
      smokeActivePill(backdrops, dark, smokeLensFor(name)),
      navLens
    );
    expect(contrast(rgb(accentColor), lens)).toBeGreaterThanOrEqual(3);
  });

  it("keeps an accent that already reads, and only lightens the ones that don't", () => {
    const pill = smokeActivePill(["#FFFFFF"], false);
    const lifted = glassAccent("#4F46FF", pill);
    // A colour that already passes comes back untouched.
    expect(glassAccent(lifted, pill)).toBe(lifted);
    expect(lifted).not.toBe("#4F46FF");
    expect(luminance(rgb(lifted))).toBeGreaterThan(luminance(rgb("#4F46FF")));
  });

  it("never lets the Android blur tint fall below what this model assumes", () => {
    // expo-blur's dark tint is 0.69 x intensity / 100 of rgb(25,25,25).
    for (const ratio of [1.5, 2, 2.75, 3.5]) {
      const { intensity, blurReductionFactor } = smokeAndroidBlur(ratio);
      expect(0.69 * (intensity / 100)).toBeGreaterThanOrEqual(SMOKE_BLUR_TINT.alpha);
      // ...and the pair still lands on the intended radius.
      expect(intensity / blurReductionFactor).toBeCloseTo(SMOKE_BLUR_RADIUS_DP * ratio);
    }
  });

  it("stays readable without blur", () => {
    // The no-blur fallback is denser, so it is never worse than the blurred case.
    expect(SMOKE_TINT_ALPHA_NO_BLUR).toBeGreaterThanOrEqual(SMOKE_TINT_ALPHA.light);
  });
});

describe("theme lens (SPENDLY-533)", () => {
  it("keeps the SPENDLY-172 blue/purple lens for every theme but Midnight Emerald", () => {
    for (const name of THEME_NAMES) {
      const lens = smokeLensFor(name);
      if (name === "midnight-emerald") expect(lens.top.rgb).toEqual([53, 232, 137]);
      else expect(lens.top.rgb).toEqual([120, 110, 255]);
    }
  });
});
