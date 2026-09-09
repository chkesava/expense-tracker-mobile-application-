import fs from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

/**
 * Ganesh Seva's multilingual support must cost the Expense Tracker and the
 * Nutrition Tracker nothing.
 *
 * The mechanism is reachability, not configuration: `metro.config.js` blocks
 * the Ganesh route groups out of the other products' builds, and Metro then
 * drops the rest of the Ganesh graph as unreachable. Metro's asset registry
 * does *not* tree-shake, so a single Indic font `require` reached from the
 * shared root chain would put 1.5 MB of TTF into all three products.
 *
 * These are static source assertions rather than runtime ones because that is
 * the only way to catch the mistake — a wrongly placed import still passes
 * every runtime test, and only shows up as a bundle that quietly grew.
 *
 * Modelled on `lib/ganeshSplash.test.ts`, which does the same for the splash
 * overlay.
 */

const ROOT = path.resolve(__dirname, "..");

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

describe("Ganesh i18n stays out of the other products", () => {
  it("keeps Ganesh i18n and Indic fonts out of the shared root layout", () => {
    const layout = read("app/_layout.tsx");
    expect(layout).not.toContain("GaneshI18nProvider");
    expect(layout).not.toContain("shared/i18n/ganesh");
    expect(layout).not.toContain("noto-sans");
    // Inter, and only Inter, is still loaded app-wide.
    expect(layout).toContain("Inter_400Regular");
    expect(layout).toContain("Inter_700Bold");
    expect(layout).not.toContain("NotoSans");
  });

  it("leaves the Expense Tracker's own localization provider untouched", () => {
    const src = read("providers/LocalizationProvider.tsx");
    expect(src.toLowerCase()).not.toContain("ganesh");
    // Its seven languages must not have grown the Indic set.
    expect(src).not.toContain('"te"');
    expect(src).not.toContain('"kn"');
    expect(src).not.toContain('"ml"');
    expect(src).not.toContain('"ta"');
  });

  it("keeps the shared theme on Inter", () => {
    // theme/ is reached by all three products, so an Indic family here would
    // change Expense's typography.
    expect(read("theme/tokens.ts")).not.toContain("NotoSans");
    const palette = read("theme/ganeshPalette.ts");
    expect(palette).not.toContain("NotoSans");
    // The palette still swaps colours only, as its own comment promises.
    expect(palette).not.toContain("fontFamily:");
  });

  it("does not couple the Ganesh language union to the Expense one", () => {
    // Sharing LanguageCode would drag Expense's es/fr/de/ja/ar into Ganesh and
    // make either product's language list a breaking change for the other.
    // Matches an import specifically: the doc comment in types.ts names the
    // Expense provider deliberately, to explain why the two are separate.
    for (const file of ["shared/i18n/ganesh/types.ts", "shared/i18n/ganesh/keys.ts"]) {
      const imports = (read(file).match(/^\s*import .*$/gm) ?? []).join(" | ");
      expect(imports, file).not.toContain("LocalizationProvider");
      expect(imports, file).not.toContain("shared/types/settings");
    }
  });

  it("loads Indic fonts by per-weight subpath, never the package barrel", () => {
    // Each barrel `require`s all nine weights: 12 MB across five scripts,
    // versus 1.5 MB for the two weights actually used.
    const fonts = read("shared/i18n/ganesh/fonts.ts");
    const barrelImports = fonts.match(/require\("@expo-google-fonts\/[a-z-]+"\)/g);
    expect(barrelImports).toBeNull();
    expect(fonts).toContain("400Regular/NotoSansTelugu_400Regular.ttf");
    expect(fonts).toContain("600SemiBold/NotoSansMalayalam_600SemiBold.ttf");
  });

  it("keeps Money on Inter so amount columns stay aligned", () => {
    // Amounts are Latin digits with lakh grouping and depend on Inter's
    // tabular figures; a Noto family would break alignment down a list for no
    // readability gain.
    const money = read("components/ganesh/ui/Money.tsx");
    expect(money).toContain("theme.fontFamily[spec.weight]");
    expect(money).toContain("tabular-nums");
    expect(money).not.toContain("g.font");
  });

  it("still blocks the Ganesh routes from the other products' bundles", () => {
    // The load-bearing line. Every isolation claim above rests on it.
    const metro = read("metro.config.js");
    expect(metro).toContain('ganesh: ["(ganesh)", "(ganesh-auth)", "ganesh-phone-auth.tsx"]');
  });
});
