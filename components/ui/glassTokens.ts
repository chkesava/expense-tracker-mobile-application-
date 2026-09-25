/**
 * Glass tint values shared by GlassSurface and its contrast test.
 * Pure module (no react-native) so lib/navContrast.test.ts can import it.
 */

/**
 * SPENDLY-154/170: "smoke" is the dark frosted glass used by the capsule nav:
 * a near-black tint in both themes (after the product reference), with white
 * labels on top. Light themes get a denser tint because light page content
 * shows through behind the blur.
 */
export const SMOKE_TINT_RGB = [20, 20, 22] as const;
export const SMOKE_TINT_ALPHA = { dark: 0.72, light: 0.8 } as const;
/** Without blur the tint has to carry contrast on its own. */
export const SMOKE_TINT_ALPHA_NO_BLUR = 0.9;
/** One BlurView per capsule; strong enough to frost, light enough to hint at content. */
export const SMOKE_BLUR_INTENSITY = 45;

/** Inactive nav labels on smoke glass. */
export const SMOKE_INACTIVE_ALPHA = 0.85;
/** Inactive nav icons: a touch brighter than labels, as in the reference. */
export const SMOKE_INACTIVE_ICON_ALPHA = 0.9;
/** The frosted pill behind the active tab. */
export const SMOKE_ACTIVE_PILL_ALPHA = 0.1;
export const SMOKE_ACTIVE_PILL_BORDER_ALPHA = 0.06;

// ---- Contrast maths (WCAG 2) -----------------------------------------------

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: RGB): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase()}`;
}

export function luminance([r, g, b]: RGB): number {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `fg` composited at `alpha` over an opaque `bg`. */
export function over(fg: RGB, bg: RGB, alpha: number): RGB {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as RGB;
}

/**
 * The active pill as it composites over a page: the smoke tint over the
 * lightest surface that can scroll beneath the capsule, plus the pill's white
 * wash. `backdrops` are that theme's page and card colours.
 */
export function smokeActivePill(backdrops: string[], isDark: boolean): RGB {
  const lightest = backdrops
    .map(hexToRgb)
    .sort((a, b) => luminance(b) - luminance(a))[0] ?? ([255, 255, 255] as RGB);
  const glass = over(
    [...SMOKE_TINT_RGB] as RGB,
    lightest,
    isDark ? SMOKE_TINT_ALPHA.dark : SMOKE_TINT_ALPHA.light
  );
  return over([255, 255, 255], glass, SMOKE_ACTIVE_PILL_ALPHA);
}

const AA_SMALL_TEXT = 4.5;

/**
 * The user's accent as it should appear on the active pill: unchanged when it
 * already holds AA there, otherwise mixed toward white just far enough to
 * pass. Dark themes keep most of the colour; light themes, whose page shows
 * through brighter, lift it further.
 */
export function glassAccent(primaryHex: string, pill: RGB): string {
  const base = hexToRgb(primaryHex);
  for (let step = 0; step <= 20; step++) {
    const mixed = over([255, 255, 255], base, step / 20);
    if (contrastRatio(mixed, pill) >= AA_SMALL_TEXT) {
      return step === 0 ? primaryHex : rgbToHex(mixed);
    }
  }
  return "#FFFFFF";
}
