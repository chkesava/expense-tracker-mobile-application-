/**
 * Insights Hub design tokens.
 *
 * Mirrors the Account Detail / Borrowings redesign palette
 * (see `components/accounts/accountScreenTheme.ts`) so the Insights dashboard
 * reads as the same Vault product rather than a second design language.
 */
import { useMemo } from "react";

import {
  ACCOUNT_GREEN,
  CARD_ORANGE,
} from "@/components/accounts/accountScreenTheme";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces, withAlpha } from "@/theme/surfaces";

/** Emerald — primary/positive accent. */
export const INSIGHT_GREEN = ACCOUNT_GREEN;
export const INSIGHT_GREEN_LIGHT = "#16A34A";
/** Rose — spending / warning accent. */
export const INSIGHT_PINK = "#F43F5E";
export const INSIGHT_PINK_SOFT = "#FB7185";
/** Amber — secondary/action accent (weekend spend, budgets). */
export const INSIGHT_AMBER = CARD_ORANGE;
/** Violet — neutral analytical accent (averages, derived metrics). */
export const INSIGHT_VIOLET = "#8B5CF6";

export type InsightSurface = {
  /** Card background. */
  card: string;
  /** Card border. */
  border: string;
  /** Gradient wash painted over the card background. */
  wash: readonly [string, string, string];
  /** Nested panel background (pacing strip, outlier rows). */
  inset: string;
  /** Nested panel border. */
  insetBorder: string;
  /** Divider / row separator. */
  hairline: string;
};

export function insightSurface(isDark: boolean): InsightSurface {
  if (isDark) {
    return {
      card: "#0C111D",
      border: "rgba(148, 163, 184, 0.14)",
      wash: ["rgba(74, 222, 128, 0.05)", "rgba(12, 17, 29, 0)", "#080C15"],
      inset: "rgba(148, 163, 184, 0.07)",
      insetBorder: "rgba(148, 163, 184, 0.12)",
      hairline: "rgba(148, 163, 184, 0.14)",
    };
  }
  return {
    card: "#FFFFFF",
    border: "rgba(15, 23, 42, 0.08)",
    wash: ["rgba(22, 163, 74, 0.05)", "rgba(255, 255, 255, 0)", "#F8FAFC"],
    inset: "rgba(15, 23, 42, 0.035)",
    insetBorder: "rgba(15, 23, 42, 0.07)",
    hairline: "rgba(15, 23, 42, 0.08)",
  };
}

export type InsightAccents = {
  /** Positive / primary. */
  green: string;
  /** Negative / spending. */
  pink: string;
  /** Secondary highlight. */
  amber: string;
  /** Neutral analytical accent. */
  violet: string;
  /** Tinted fill behind an accent icon. */
  greenDim: string;
  pinkDim: string;
};

export function insightAccents(isDark: boolean): InsightAccents {
  return {
    green: isDark ? INSIGHT_GREEN : INSIGHT_GREEN_LIGHT,
    pink: isDark ? INSIGHT_PINK_SOFT : "#DC2626",
    amber: INSIGHT_AMBER,
    violet: isDark ? "#A78BFA" : "#7C3AED",
    greenDim: isDark ? "rgba(74, 222, 128, 0.14)" : "rgba(22, 163, 74, 0.1)",
    pinkDim: isDark ? "rgba(244, 63, 94, 0.16)" : "rgba(220, 38, 38, 0.08)",
  };
}

// ---------------------------------------------------------------------------
// SPENDLY-538 — theme-driven Insights tokens.
//
// The functions above hardcode the old emerald/rose palette regardless of the
// active theme, and use rose for plain spending. These hooks derive the same
// roles from the theme instead, with semantic names: spending is `spend` (the
// info colour, as on the dashboard), and red is reserved for `negative`.
// Analytics files move onto them story by story (SPENDLY-538..540); the
// functions above go once nothing imports them.
// ---------------------------------------------------------------------------

export type InsightThemeAccents = {
  /** Money in, savings, good pace. */
  positive: string;
  /** Plain spending — neutral, never "bad" by colour alone. */
  spend: string;
  /** Overspend, losses, alerts. */
  negative: string;
  /** Secondary highlight (weekend split, budgets). */
  highlight: string;
  /** Interactive / brand accent (links, selected state). */
  accent: string;
  positiveDim: string;
  spendDim: string;
  negativeDim: string;
  accentDim: string;
};

export function useInsightAccents(): InsightThemeAccents {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  return useMemo(
    () => ({
      positive: theme.colors.success,
      spend: theme.colors.info,
      negative: theme.colors.destructive,
      highlight: theme.colors.warning,
      accent: theme.colors.primary,
      positiveDim: surfaces.wash(theme.colors.success),
      spendDim: surfaces.wash(theme.colors.info),
      negativeDim: surfaces.wash(theme.colors.destructive),
      accentDim: surfaces.wash(theme.colors.primary),
    }),
    [theme, surfaces]
  );
}

export function useInsightSurface(): InsightSurface {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  return useMemo(
    () => ({
      card: theme.colors.card,
      border: theme.colors.outlineVariant,
      wash: [
        withAlpha(theme.colors.primary, surfaces.isDark ? 0.06 : 0.035),
        withAlpha(theme.colors.primary, 0),
        theme.colors.card,
      ] as const,
      inset: surfaces.tile,
      insetBorder: theme.colors.outlineVariant,
      hairline: surfaces.divider,
    }),
    [theme, surfaces]
  );
}
