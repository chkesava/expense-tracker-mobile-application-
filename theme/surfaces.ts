import { useMemo } from "react";

import { useTheme } from "./ThemeProvider";
import { themeUsesDarkPalette, type ThemeName, type ThemeTokens } from "./tokens";

/** #RRGGBB → rgba(). Accepts already-rgba strings unchanged. */
export function withAlpha(color: string, alpha: number): string {
  if (!color.startsWith("#")) return color;
  const hex = color.slice(1);
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return color;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export type Surfaces = {
  isDark: boolean;
  /** Inset tile fill — low enough that a tile inside a card never reads as a second card. */
  tile: string;
  /** Neutral control fill: unselected chips, segment tracks, selector rows. */
  control: string;
  /** Progress / meter track. */
  track: string;
  /** Hairline divider between list rows. */
  divider: string;
  /** Tint a semantic colour down to a background wash. */
  wash: (color: string) => string;
};

/**
 * Spendly's low-contrast fills. Screens used to hand-roll
 * `isDark ? "rgba(255,255,255,0.0x)" : "rgba(0,0,0,0.0x)"` with slightly
 * different alphas each time; this is the one source for them (SPENDLY-152).
 */
export function surfacesFor(theme: ThemeTokens, themeName: ThemeName): Surfaces {
  const isDark = themeUsesDarkPalette(themeName);
  return {
    isDark,
    tile: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.025)",
    control: isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.04)",
    track: isDark ? "rgba(255,255,255,0.09)" : "rgba(15,23,42,0.07)",
    divider: theme.colors.outlineVariant ?? theme.colors.border,
    wash: (color: string) => withAlpha(color, isDark ? 0.16 : 0.1),
  };
}

export function useSurfaces(): Surfaces {
  const { theme, themeName } = useTheme();
  return useMemo(() => surfacesFor(theme, themeName), [theme, themeName]);
}
