/**
 * Glass tint values shared by GlassSurface and its contrast test.
 * Pure module (no react-native) so lib/navContrast.test.ts can import it.
 */

/**
 * SPENDLY-154/170/172: "smoke" is the iOS-style glass used by the capsule nav:
 * a backdrop blur under a cool blue/indigo tint, a subtle cool rim, a restrained
 * gloss and a blue atmospheric glow, with white content on top. It looks the
 * same in every theme; only the tint density adapts, because a light page shows
 * through brighter than a dark one.
 */
export const SMOKE_TINT_RGB = [25, 32, 58] as const;
/**
 * Dark themes: a thin film, so the blurred page shows through as glass rather
 * than a grey slab (the tint is lighter than a dark page, so a dense one reads
 * opaque). Light themes need more, or white labels lose contrast over a white
 * page; lib/navContrast.test.ts holds that line.
 */
export const SMOKE_TINT_ALPHA = { dark: 0.2, light: 0.72 } as const;
/** Without blur the tint has to carry contrast on its own. */
export const SMOKE_TINT_ALPHA_NO_BLUR = 0.9;

/**
 * Blur radius in dp. expo-blur's Android radius is `intensity /
 * blurReductionFactor` physical pixels, and its dark tint is 0.69 x
 * intensity / 100, so the two are coupled. GlassSurface picks the intensity
 * for the tint it wants (`SMOKE_ANDROID_BLUR_TINT_ALPHA`) and then the
 * reduction factor that turns that into this radius on the device's density.
 * iOS uses `SMOKE_IOS_INTENSITY` with its native dark material.
 */
export const SMOKE_BLUR_RADIUS_DP = 8;
export const SMOKE_ANDROID_BLUR_TINT_ALPHA = 0.1;
export const SMOKE_IOS_INTENSITY = 70;
/**
 * Darkening the blur layer itself adds before our tint, as the contrast model
 * counts it: rgb(25,25,25), a little under what Android actually lays down.
 */
export const SMOKE_BLUR_TINT = { rgb: [25, 25, 25] as const, alpha: 0.09 } as const;

/** Android BlurView props that give `SMOKE_BLUR_RADIUS_DP` at `pixelRatio`. */
export function smokeAndroidBlur(pixelRatio: number): {
  intensity: number;
  blurReductionFactor: number;
} {
  const intensity = (SMOKE_ANDROID_BLUR_TINT_ALPHA / 0.69) * 100;
  const radiusPx = SMOKE_BLUR_RADIUS_DP * pixelRatio;
  return { intensity, blurReductionFactor: intensity / radiusPx };
}

/**
 * Specular gloss across the top of the glass: white at this alpha along the
 * top edge, fading out by `SMOKE_GLOSS_END` of the height. Icons sit in that
 * band, so the contrast test checks them against the glossed glass.
 */
export const SMOKE_GLOSS_ALPHA = 0.18;
export const SMOKE_GLOSS_END = 0.55;

/** Inactive nav labels on smoke glass. */
export const SMOKE_INACTIVE_ALPHA = 0.85;
/** Inactive nav icons: a touch brighter than labels, as in the reference. */
export const SMOKE_INACTIVE_ICON_ALPHA = 0.9;
/**
 * The lens behind the active tab: a blue/purple translucent gradient rather
 * than a white bubble. The contrast model uses the brighter top stop.
 */
export const SMOKE_LENS_TOP = { rgb: [120, 110, 255] as const, alpha: 0.16 } as const;
export const SMOKE_LENS_BOTTOM = { rgb: [80, 90, 180] as const, alpha: 0.08 } as const;
export const SMOKE_LENS_BORDER = "rgba(160, 170, 255, 0.10)";

/** `{rgb, alpha}` as a CSS colour string. */
export function rgbaString({ rgb, alpha }: { rgb: readonly number[]; alpha: number }): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

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
 * The active lens as it composites over a page, at the label's height: the
 * smoke glass over the lightest surface that can scroll beneath the capsule,
 * plus the lens tint. `backdrops` are that theme's page and card colours.
 */
export function smokeActivePill(backdrops: string[], isDark: boolean): RGB {
  return overLens(smokeGlass(lightestOf(backdrops), isDark));
}

/** The active lens at the icon's height, where the top gloss adds to it. */
export function smokeActiveLens(backdrops: string[], isDark: boolean): RGB {
  const glossed = over([255, 255, 255], smokeGlass(lightestOf(backdrops), isDark), SMOKE_GLOSS_ALPHA);
  return overLens(glossed);
}

function overLens(glass: RGB): RGB {
  return over([...SMOKE_LENS_TOP.rgb] as RGB, glass, SMOKE_LENS_TOP.alpha);
}

function lightestOf(backdrops: string[]): RGB {
  return (
    backdrops.map(hexToRgb).sort((a, b) => luminance(b) - luminance(a))[0] ??
    ([255, 255, 255] as RGB)
  );
}

/** The smoke glass over an opaque backdrop: the blur's own tint, then ours. */
export function smokeGlass(backdrop: RGB, isDark: boolean): RGB {
  const blurred = over([...SMOKE_BLUR_TINT.rgb] as RGB, backdrop, SMOKE_BLUR_TINT.alpha);
  return over(
    [...SMOKE_TINT_RGB] as RGB,
    blurred,
    isDark ? SMOKE_TINT_ALPHA.dark : SMOKE_TINT_ALPHA.light
  );
}

const AA_SMALL_TEXT = 4.5;
/** WCAG non-text contrast, for the icon. */
const AA_GRAPHICS = 3;

/**
 * The user's accent as it should appear on the active pill: unchanged when it
 * already holds AA there, otherwise mixed toward white just far enough to
 * pass. Dark themes keep most of the colour; light themes, whose page shows
 * through brighter, lift it further.
 */
export function glassAccent(primaryHex: string, pill: RGB, lens: RGB = pill): string {
  const base = hexToRgb(primaryHex);
  for (let step = 0; step <= 20; step++) {
    const mixed = over([255, 255, 255], base, step / 20);
    // The label sits on the pill; the icon sits higher, on the glossed lens.
    if (contrastRatio(mixed, pill) >= AA_SMALL_TEXT && contrastRatio(mixed, lens) >= AA_GRAPHICS) {
      return step === 0 ? primaryHex : rgbToHex(mixed);
    }
  }
  return "#FFFFFF";
}
