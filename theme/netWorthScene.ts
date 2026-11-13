/**
 * The Net Worth card's decorative mountain/sunrise backdrop — time-of-day
 * scene data and colour math, pulled out of
 * `components/dashboard/NetWorthCardBackdrop.tsx` so it is provable here
 * (`vitest.config.ts` does not run `components/**`, same reason
 * `monthLabel.ts` lives outside `components/epf/`).
 *
 * The hues are a fixed decorative palette (like `categoryRamp`'s tail or
 * `BUDGET_ORB`) — they carry no positive/negative meaning.
 *
 * Two different jobs, two different looks:
 * - On a **light** palette (the "Mountain Sunrise" reference is Rose Elegance,
 *   a light palette) the scene renders vividly — a real pale sky, coloured
 *   ridgelines, a strong sun glow — because dark text over a pale sky stays
 *   legible on its own, the way the reference shows it.
 * - On a **dark** palette the same sky/ridge art would fight light-coloured
 *   text, so it stays a faint, moody suggestion instead (low alpha,
 *   `theme.colors.foreground`-tinted ridges) — legibility there leans on
 *   `NetWorthGlassCard`'s own wash gradient, which is correspondingly stronger
 *   in dark mode (see `NET_WORTH_CARD_WASH_ALPHA`).
 */
import type { DayPeriod } from "@/shared/utils/dayPeriod";

export type NetWorthScene = {
  cx: number;
  cy: number;
  r: number;
  /** Sun/moon glow + disc colour. */
  glow: string;
  body: string;
  /** Sky gradient top colour (light palettes only). */
  sky: string;
  /** Ridgeline colours (light palettes only) — far is paler than near. */
  ridgeFar: string;
  ridgeNear: string;
  stars?: boolean;
};

export const NET_WORTH_SCENES: Record<DayPeriod, NetWorthScene> = {
  // Sun low and rising, warm amber over a cool morning-blue sky.
  morning: {
    cx: 300,
    cy: 58,
    r: 20,
    glow: "#FDBA74",
    body: "#FBBF24",
    sky: "#BFDBFE",
    ridgeFar: "#93A8C8",
    ridgeNear: "#5B6B8C",
  },
  // Sun high, brightest, pale warm-white over a bright midday sky.
  afternoon: {
    cx: 300,
    cy: 32,
    r: 24,
    glow: "#FDE68A",
    body: "#FDE047",
    sky: "#E0F2FE",
    ridgeFar: "#A5B4CB",
    ridgeNear: "#64748B",
  },
  // Sun low again, warm rose sunset over a peach-pink sky.
  evening: {
    cx: 300,
    cy: 70,
    r: 22,
    glow: "#FDA4AF",
    body: "#FB7185",
    sky: "#FBCFE8",
    ridgeFar: "#C4A6C9",
    ridgeNear: "#8B6F93",
  },
  // Moon, cool pale silver, with a scatter of stars over a deep navy sky.
  // This exact palette is for a **dark** palette's faint night suggestion —
  // on a light palette it would be invisible (a pale moon over its own pale
  // sky), so `resolveNetWorthScene` swaps in `NET_WORTH_LIGHT_NIGHT_SCENE`.
  night: {
    cx: 300,
    cy: 38,
    r: 16,
    glow: "#CBD5E1",
    body: "#E2E8F0",
    sky: "#1E293B",
    ridgeFar: "#334155",
    ridgeNear: "#1E293B",
    stars: true,
  },
};

/**
 * Night, on a light palette: a soft dusk-indigo sky with a warm gold moon —
 * `NET_WORTH_SCENES.night`'s pale-silver-on-navy pairing only reads against a
 * dark card; against a light one the moon needs to be a different colour
 * from its sky to stay visible at all, not just a different alpha.
 */
export const NET_WORTH_LIGHT_NIGHT_SCENE: NetWorthScene = {
  cx: 300,
  cy: 38,
  r: 18,
  glow: "#FDE68A",
  body: "#FBBF24",
  sky: "#C7D2FE",
  ridgeFar: "#8B93D6",
  ridgeNear: "#4C4F9E",
  stars: true,
};

/** The scene to draw for `period`, given the active palette's appearance. */
export function resolveNetWorthScene(isDark: boolean, period: DayPeriod): NetWorthScene {
  if (!isDark && period === "night") return NET_WORTH_LIGHT_NIGHT_SCENE;
  return NET_WORTH_SCENES[period];
}

export const NET_WORTH_SCENE_STAR_POSITIONS = [
  { cx: 60, cy: 24, r: 1.6 },
  { cx: 120, cy: 46, r: 1.2 },
  { cx: 190, cy: 20, r: 1.4 },
  { cx: 230, cy: 50, r: 1.1 },
  { cx: 355, cy: 90, r: 1.3 },
  { cx: 20, cy: 70, r: 1.1 },
] as const;

/** The card's own theme-derived wash gradient alpha range (`NetWorthGlassCard`). */
export const NET_WORTH_CARD_WASH_ALPHA = { light: 0.22, dark: 0.55 } as const;

export interface NetWorthSceneAlphas {
  skyAlpha: number;
  glowAlpha: number;
  bodyAlpha: number;
  starAlpha: number;
  ridgeFarAlpha: number;
  ridgeNearAlpha: number;
}

/**
 * The per-period alpha values `NetWorthCardBackdrop` renders with, given
 * whether the active theme is a dark-appearance palette. Light palettes get
 * a vivid scene (matching the reference); dark palettes get a faint one, so
 * light-coloured text stays legible without needing a heavy scrim.
 */
export function netWorthSceneAlphas(isDark: boolean, period: DayPeriod): NetWorthSceneAlphas {
  const skyAlpha = isDark ? 0.16 : 0.55;
  const glowAlpha = isDark ? 0.26 : 0.55;
  const bodyAlpha = isDark ? 0.32 : 0.9;
  // Only the night scene has stars (`NET_WORTH_SCENES.night.stars`); gating
  // here too (not just at the render site) keeps this function's own output
  // honest about when stars are actually visible.
  const starAlpha = period === "night" ? (isDark ? 0.5 : 0.35) : 0;
  // Brightest (afternoon) washes the ridges out a touch more than a dim
  // evening or a moonlit night does.
  const ridgeDim = period === "afternoon" ? 0.85 : period === "night" ? 1.15 : 1;
  const ridgeFarAlpha = (isDark ? 0.1 : 0.35) * ridgeDim;
  const ridgeNearAlpha = (isDark ? 0.16 : 0.55) * ridgeDim;
  return { skyAlpha, glowAlpha, bodyAlpha, starAlpha, ridgeFarAlpha, ridgeNearAlpha };
}

/**
 * The largest fraction of the final pixel colour the scene's sun/moon body
 * can possibly contribute once the card's own wash gradient is drawn on top
 * of it: `(1 - washAlpha) * bodyAlpha`. On dark palettes this stays low by
 * construction — the wash is the dominant layer there. On light palettes the
 * scene is allowed to read strongly (the reference's look); legibility there
 * comes from the sky/ridge art itself being pale enough for dark text, not
 * from suppressing it under a heavy wash.
 */
export function netWorthSceneMaxVisibleAlpha(isDark: boolean, period: DayPeriod): number {
  const washAlpha = isDark ? NET_WORTH_CARD_WASH_ALPHA.dark : NET_WORTH_CARD_WASH_ALPHA.light;
  const { bodyAlpha } = netWorthSceneAlphas(isDark, period);
  return (1 - washAlpha) * bodyAlpha;
}
