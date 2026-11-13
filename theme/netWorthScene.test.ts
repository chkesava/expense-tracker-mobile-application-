import { describe, expect, it } from "vitest";
import {
  NET_WORTH_CARD_WASH_ALPHA,
  NET_WORTH_LIGHT_NIGHT_SCENE,
  NET_WORTH_SCENES,
  netWorthSceneAlphas,
  netWorthSceneMaxVisibleAlpha,
  resolveNetWorthScene,
} from "./netWorthScene";
import { createTheme, themeUsesDarkPalette, THEME_NAMES } from "./tokens";
import type { DayPeriod } from "@/shared/utils/dayPeriod";

const PERIODS: DayPeriod[] = ["morning", "afternoon", "evening", "night"];

/** Euclidean distance between two `#rrggbb` colours' channels (0..441). */
function colorDistance(a: string, b: string): number {
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

describe("Net Worth card backdrop — full theme-palette x time-of-day sweep", () => {
  // Every palette this build ships (SPENDLY-618/677): 2 base + 4 midnight + 6 expense.
  it("covers all 12 shipped palettes", () => {
    expect(THEME_NAMES).toHaveLength(12);
  });

  it.each(THEME_NAMES)("renders a valid theme for %s", (themeName) => {
    const theme = createTheme(themeName);
    expect(theme.colors.foreground).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    expect(theme.colors.card).toMatch(/^#[0-9a-fA-F]{3,8}$/);
  });

  it.each(PERIODS)("%s scene defines a sun/moon, a sky and ridge colours", (period) => {
    const scene = NET_WORTH_SCENES[period];
    for (const hex of [scene.glow, scene.body, scene.sky, scene.ridgeFar, scene.ridgeNear]) {
      expect(hex).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  describe("resolveNetWorthScene", () => {
    it.each(PERIODS)("on a dark palette, %s resolves to NET_WORTH_SCENES as-is", (period) => {
      expect(resolveNetWorthScene(true, period)).toBe(NET_WORTH_SCENES[period]);
    });

    it("on a light palette, day periods resolve to NET_WORTH_SCENES as-is", () => {
      expect(resolveNetWorthScene(false, "morning")).toBe(NET_WORTH_SCENES.morning);
      expect(resolveNetWorthScene(false, "afternoon")).toBe(NET_WORTH_SCENES.afternoon);
      expect(resolveNetWorthScene(false, "evening")).toBe(NET_WORTH_SCENES.evening);
    });

    it("on a light palette, night swaps in the light-night scene (the moon must stay visible against its own sky)", () => {
      expect(resolveNetWorthScene(false, "night")).toBe(NET_WORTH_LIGHT_NIGHT_SCENE);
      expect(NET_WORTH_LIGHT_NIGHT_SCENE).not.toBe(NET_WORTH_SCENES.night);
    });

    // The bug this guards against: NET_WORTH_SCENES.night's pale moon on a
    // pale sky is invisible once rendered without a dark card behind it —
    // every scene's moon/sun must read as a distinct colour from its own sky.
    it.each([
      ["morning", NET_WORTH_SCENES.morning],
      ["afternoon", NET_WORTH_SCENES.afternoon],
      ["evening", NET_WORTH_SCENES.evening],
      ["night (light palette)", NET_WORTH_LIGHT_NIGHT_SCENE],
    ] as const)("%s: the sun/moon is visibly distinct from its own sky", (_label, scene) => {
      expect(colorDistance(scene.body, scene.sky)).toBeGreaterThan(60);
    });
  });

  for (const themeName of THEME_NAMES) {
    const isDark = themeUsesDarkPalette(themeName);

    describe(`${themeName} (${isDark ? "dark" : "light"} appearance)`, () => {
      it.each(PERIODS)("%s scene alphas are all in 0..1", (period) => {
        const alphas = netWorthSceneAlphas(isDark, period);
        for (const value of Object.values(alphas)) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      });

      if (isDark) {
        // Dark palettes: the scene stays a faint, moody suggestion — the
        // card's own (stronger) wash is what guarantees legibility there.
        it.each(PERIODS)(
          "%s scene can never move more than 15%% of a pixel's colour once the card's wash is drawn on top",
          (period) => {
            const maxVisible = netWorthSceneMaxVisibleAlpha(isDark, period);
            expect(maxVisible).toBeGreaterThan(0);
            expect(maxVisible).toBeLessThan(0.15);
          }
        );
      } else {
        // Light palettes: the scene is allowed to read strongly (the
        // reference's look) because dark text over a pale sky is legible
        // without a heavy wash — assert it actually does read strongly,
        // not that it stays hidden.
        it.each(PERIODS)("%s scene is vividly visible (the reference's look)", (period) => {
          const maxVisible = netWorthSceneMaxVisibleAlpha(isDark, period);
          expect(maxVisible).toBeGreaterThan(0.5);
        });
      }

      it("stars are a night-only accent, dimmer in daylight scenes than at night", () => {
        const night = netWorthSceneAlphas(isDark, "night").starAlpha;
        const afternoon = netWorthSceneAlphas(isDark, "afternoon").starAlpha;
        expect(afternoon).toBe(0);
        expect(night).toBeGreaterThan(0);
        expect(NET_WORTH_SCENES.night.stars).toBe(true);
        expect(NET_WORTH_SCENES.morning.stars).toBeUndefined();
      });
    });
  }

  it("the dark-palette wash is markedly stronger than the light-palette wash", () => {
    expect(NET_WORTH_CARD_WASH_ALPHA.dark).toBeGreaterThan(NET_WORTH_CARD_WASH_ALPHA.light);
    expect(NET_WORTH_CARD_WASH_ALPHA.dark).toBeGreaterThan(0.4);
    expect(NET_WORTH_CARD_WASH_ALPHA.light).toBeLessThan(0.3);
  });
});
