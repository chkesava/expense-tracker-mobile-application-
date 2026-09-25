/**
 * Glass tint values shared by GlassSurface and its contrast test.
 * Pure module (no react-native) so lib/navContrast.test.ts can import it.
 */

/**
 * SPENDLY-154: "smoke" is the glossy dark glass used by the capsule nav: a
 * near-black tint in both themes (after the product reference), with white
 * labels on top. Light themes get a denser tint because light page content
 * shows through behind the blur.
 */
export const SMOKE_TINT_RGB = [10, 12, 20] as const;
export const SMOKE_TINT_ALPHA = { dark: 0.38, light: 0.72 } as const;
/** Without blur the tint has to carry contrast on its own. */
export const SMOKE_TINT_ALPHA_NO_BLUR = 0.9;

/** Inactive nav labels/icons on smoke glass (active ones are full white). */
export const SMOKE_INACTIVE_ALPHA = 0.8;
