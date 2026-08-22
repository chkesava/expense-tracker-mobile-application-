/**
 * Insights Hub design tokens.
 *
 * Mirrors the Account Detail / Borrowings redesign palette
 * (see `components/accounts/accountScreenTheme.ts`) so the Insights dashboard
 * reads as the same Vault product rather than a second design language.
 */
import {
  ACCOUNT_GREEN,
  CARD_ORANGE,
} from "@/components/accounts/accountScreenTheme";

/** Emerald — primary/positive accent. */
export const INSIGHT_GREEN = ACCOUNT_GREEN;
export const INSIGHT_GREEN_LIGHT = "#16A34A";
/** Rose — spending / warning accent. */
export const INSIGHT_PINK = "#F43F5E";
export const INSIGHT_PINK_SOFT = "#FB7185";
/** Amber — secondary/action accent (weekend spend, budgets). */
export const INSIGHT_AMBER = CARD_ORANGE;

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
  /** Tinted fill behind an accent icon. */
  greenDim: string;
  pinkDim: string;
};

export function insightAccents(isDark: boolean): InsightAccents {
  return {
    green: isDark ? INSIGHT_GREEN : INSIGHT_GREEN_LIGHT,
    pink: isDark ? INSIGHT_PINK_SOFT : "#DC2626",
    amber: INSIGHT_AMBER,
    greenDim: isDark ? "rgba(74, 222, 128, 0.14)" : "rgba(22, 163, 74, 0.1)",
    pinkDim: isDark ? "rgba(244, 63, 94, 0.16)" : "rgba(220, 38, 38, 0.08)",
  };
}
