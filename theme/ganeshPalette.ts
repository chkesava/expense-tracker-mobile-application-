/**
 * Ganesh Seva palette.
 *
 * Ganesh Seva is its own product, not a skin over the Expense Tracker. It does
 * not use `lightColors`/`darkColors` and it ignores the user's accent choice —
 * a pandal committee's app should look the same on every committee member's
 * phone, so the festival identity is fixed rather than personalised.
 *
 * Grounds are warm ivory rather than the Expense Tracker's cool `#F7F9FC`,
 * which is the single biggest reason the two products read differently at a
 * glance.
 *
 * Roles worth knowing before editing:
 * - `secondary` / `muted` are **surfaces**, not brand colours. Components fill
 *   chips and inset tiles with them. Keep them near-neutral; the festival
 *   colours live in `primary` and in `useGaneshTokens()` (saffron, maroon, gold).
 * - `primary` marks actions and identity. Amounts render in `foreground` —
 *   see `components/ganesh/ui/tokens.ts`.
 *
 * Contrast: every foreground/background pair here clears WCAG AA (4.5:1) for
 * body text, because pandal organisers use this outdoors in daylight.
 */

import type { ChartTokens, ColorTokens, ThemeTokens } from "./tokens";

/** Warm ivory ground, deep vermilion action colour. */
export const ganeshLightColors: ColorTokens = {
  background: "#FDF8F0",
  foreground: "#241609",
  card: "#FFFFFF",
  cardForeground: "#241609",
  primary: "#C2410C",
  primaryForeground: "#FFF8F1",
  secondary: "#F6EADA",
  secondaryForeground: "#3D2A1A",
  muted: "#F6EADA",
  mutedForeground: "#7A6A5F",
  destructive: "#B3261E",
  destructiveForeground: "#FFFFFF",
  success: "#1F7A4D",
  successForeground: "#FFFFFF",
  warning: "#B45309",
  warningForeground: "#FFFFFF",
  border: "#EADFCF",
  tint: "#C2410C",
  tabIconDefault: "#9C8B7D",
  tabIconSelected: "#C2410C",
  primaryContainer: "#FCE7D5",
  onPrimaryContainer: "#4A1704",
  secondaryContainer: "#F3E4D2",
  onSecondaryContainer: "#4A2C1A",
  surfaceVariant: "#F5EADC",
  onSurfaceVariant: "#5C4A3C",
  outline: "#C4B29C",
  outlineVariant: "#EADFCF",
  scrim: "rgba(36, 22, 9, 0.5)",
  info: "#1D6F9C",
  infoForeground: "#FFFFFF",
};

/** Lamp-lit dark — warm browns rather than the Expense Tracker's blue-blacks. */
export const ganeshDarkColors: ColorTokens = {
  background: "#171009",
  foreground: "#F6EDE2",
  card: "#211711",
  cardForeground: "#F6EDE2",
  primary: "#FB923C",
  primaryForeground: "#2B1405",
  secondary: "#2C1F17",
  secondaryForeground: "#F6EDE2",
  muted: "#2C1F17",
  mutedForeground: "#B8A697",
  destructive: "#F2635A",
  destructiveForeground: "#2B0906",
  success: "#4ECB8B",
  successForeground: "#04220F",
  warning: "#F0B045",
  warningForeground: "#2B1B02",
  border: "#33251C",
  tint: "#FB923C",
  tabIconDefault: "#9A8778",
  tabIconSelected: "#FB923C",
  primaryContainer: "#52220A",
  onPrimaryContainer: "#FFDCC2",
  secondaryContainer: "#3A2A1E",
  onSecondaryContainer: "#F0DECA",
  surfaceVariant: "#2A1E16",
  onSurfaceVariant: "#CBB8A6",
  outline: "#6B5644",
  outlineVariant: "#33251C",
  scrim: "rgba(0, 0, 0, 0.7)",
  info: "#6FB6DE",
  infoForeground: "#04202E",
};

/**
 * Festival chart ramp — marigold, vermilion, maroon, temple green, sky, rose.
 * Ordered so the first three read as a festival even in a two-slice chart.
 */
const ganeshLightChart: ChartTokens = {
  categorical: ["#C2410C", "#B98029", "#7B1D3A", "#1F7A4D", "#1D6F9C", "#A83E63"],
  positive: "#1F7A4D",
  negative: "#B3261E",
};

const ganeshDarkChart: ChartTokens = {
  categorical: ["#FB923C", "#E0B558", "#F0A7BE", "#4ECB8B", "#6FB6DE", "#E88AA9"],
  positive: "#4ECB8B",
  negative: "#F2635A",
};

/**
 * Overlay the festival palette onto the app's base tokens.
 *
 * Everything structural — space, radius, typography, fonts, elevation, icon
 * sizes, the MD3 type scale — is inherited unchanged, so Ganesh keeps the same
 * rhythm and Inter type as the rest of the app. Only colour changes here;
 * Ganesh-specific *geometry* lives in `components/ganesh/ui/surfaces.tsx`.
 */
export function createGaneshTheme(base: ThemeTokens, isDark: boolean): ThemeTokens {
  return {
    ...base,
    colors: isDark ? ganeshDarkColors : ganeshLightColors,
    chart: isDark ? ganeshDarkChart : ganeshLightChart,
  };
}
