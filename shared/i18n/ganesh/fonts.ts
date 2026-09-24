/**
 * Indic font families for Ganesh Seva.
 *
 * Inter — the app-wide family loaded in `app/_layout.tsx` — has no Devanagari,
 * Telugu, Tamil, Kannada or Malayalam glyphs, so a translated screen would fall
 * back to whatever the platform picks, with inconsistent metrics per device.
 *
 * Noto Sans is used across all five scripts rather than a script-specific
 * family each, because one design system keeps a Telugu screen and a Tamil
 * screen on the same rhythm, and Noto sits close to Inter (both neo-grotesque)
 * so a mixed-script row does not clash.
 *
 * **Isolation:** this module must stay reachable only from `app/(ganesh)/**`.
 * `metro.config.js` blocks the Ganesh route groups out of the Expense and
 * Nutrition builds, and Metro then drops this graph as unreachable — that
 * reachability is the *only* thing keeping these fonts out of the other two
 * products, since Metro's asset registry does not tree-shake. Never import it
 * from `app/_layout.tsx` or anything in `theme/`.
 *
 * **Two weights, per-weight subpaths.** Each package publishes nine weights and
 * its barrel `index.js` `require`s every one of them, so importing
 * `@expo-google-fonts/noto-sans-telugu` would register all nine. Metro's asset
 * registry does not tree-shake, so that is 12 MB of TTF across five scripts.
 * Importing the two weight subpaths directly is 1.5 MB instead. Measured:
 * devanagari 436 KB, telugu 356 KB, kannada 296 KB, malayalam 216 KB, tamil
 * 160 KB.
 *
 * Two weights rather than four because Ganesh's type hierarchy is carried
 * mostly by size and colour (see `components/ganesh/ui/Money.tsx` and
 * `ui/surfaces.tsx`), so aliasing regular+medium to 400 and semibold+bold to
 * 600 costs little and halves the payload again.
 *
 * `require` rather than `import` for the assets, matching the house convention
 * in `components/ganesh/admin/adminArt.tsx` — there is no ambient `.ttf`
 * module declaration in this repo.
 */
import { type GaneshScript } from "./types";

export type GaneshFontFamily = {
  regular: string;
  medium: string;
  semibold: string;
  bold: string;
};

type ScriptFonts = {
  /** Family names, aliased two-weights-to-four. */
  family: GaneshFontFamily;
  /** The map handed to `Font.loadAsync`. */
  assets: () => Record<string, unknown>;
};

function family(regular: string, semibold: string): GaneshFontFamily {
  return { regular, medium: regular, semibold, bold: semibold };
}

export const GANESH_SCRIPT_FONTS: Record<Exclude<GaneshScript, "latin">, ScriptFonts> = {
  devanagari: {
    family: family("NotoSansDevanagari_400Regular", "NotoSansDevanagari_600SemiBold"),
    assets: () => ({
      NotoSansDevanagari_400Regular: require("@expo-google-fonts/noto-sans-devanagari/400Regular/NotoSansDevanagari_400Regular.ttf"),
      NotoSansDevanagari_600SemiBold: require("@expo-google-fonts/noto-sans-devanagari/600SemiBold/NotoSansDevanagari_600SemiBold.ttf"),
    }),
  },
  telugu: {
    family: family("NotoSansTelugu_400Regular", "NotoSansTelugu_600SemiBold"),
    assets: () => ({
      NotoSansTelugu_400Regular: require("@expo-google-fonts/noto-sans-telugu/400Regular/NotoSansTelugu_400Regular.ttf"),
      NotoSansTelugu_600SemiBold: require("@expo-google-fonts/noto-sans-telugu/600SemiBold/NotoSansTelugu_600SemiBold.ttf"),
    }),
  },
  tamil: {
    family: family("NotoSansTamil_400Regular", "NotoSansTamil_600SemiBold"),
    assets: () => ({
      NotoSansTamil_400Regular: require("@expo-google-fonts/noto-sans-tamil/400Regular/NotoSansTamil_400Regular.ttf"),
      NotoSansTamil_600SemiBold: require("@expo-google-fonts/noto-sans-tamil/600SemiBold/NotoSansTamil_600SemiBold.ttf"),
    }),
  },
  kannada: {
    family: family("NotoSansKannada_400Regular", "NotoSansKannada_600SemiBold"),
    assets: () => ({
      NotoSansKannada_400Regular: require("@expo-google-fonts/noto-sans-kannada/400Regular/NotoSansKannada_400Regular.ttf"),
      NotoSansKannada_600SemiBold: require("@expo-google-fonts/noto-sans-kannada/600SemiBold/NotoSansKannada_600SemiBold.ttf"),
    }),
  },
  malayalam: {
    family: family("NotoSansMalayalam_400Regular", "NotoSansMalayalam_600SemiBold"),
    assets: () => ({
      NotoSansMalayalam_400Regular: require("@expo-google-fonts/noto-sans-malayalam/400Regular/NotoSansMalayalam_400Regular.ttf"),
      NotoSansMalayalam_600SemiBold: require("@expo-google-fonts/noto-sans-malayalam/600SemiBold/NotoSansMalayalam_600SemiBold.ttf"),
    }),
  },
};

/** The family names for a script, or null for Latin — which keeps Inter. */
export function ganeshFontFamilyFor(script: GaneshScript): GaneshFontFamily | null {
  return script === "latin" ? null : GANESH_SCRIPT_FONTS[script].family;
}

/**
 * The `Font.loadAsync` map for a set of scripts.
 *
 * Takes a set because the language picker renders all six endonyms at once —
 * without every script loaded, four of the six chips show tofu at exactly the
 * moment an admin needs to read them.
 */
export function ganeshFontAssetsFor(scripts: GaneshScript[]): Record<string, unknown> {
  let assets: Record<string, unknown> = {};
  for (const script of scripts) {
    if (script === "latin") continue;
    assets = { ...assets, ...GANESH_SCRIPT_FONTS[script].assets() };
  }
  return assets;
}
