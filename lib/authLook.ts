/**
 * Colours for the shared first-run and sign-in screens (SPENDLY-556).
 *
 * `/onboarding` and `/(auth)/login` are shared: Expense and Nutrition both
 * sign in there, and every build shows the first-run carousel. Only Expense
 * moves to the Midnight Emerald direction (theme tokens). The other products
 * keep the exact colours they had, so their sign-in looks the same as before.
 * Ganesh signs in on its own `(ganesh-auth)` screen and isn't affected.
 */

import type { ThemeTokens } from "@/theme/tokens";
import type { Product } from "./activeProduct";

/** The combined build is Expense's: its chooser only offers Expense and Ganesh, and Ganesh has its own sign-in. */
export function usesExpenseLook(product: Product | null): boolean {
  return product !== "nutrition" && product !== "ganesh";
}

export type AuthPalette = {
  title: string;
  muted: string;
  icon: string;
  surface: string;
  surfaceBorder: string;
  surfaceShadow: string;
  link: string;
  linkDisabled: string;
  divider: string;
  dividerText: string;
  /** The primary button: a gradient before, the solid accent for Expense. */
  cta: readonly [string, string];
  ctaText: string;
};

/** The pre-556 test for "dark": it only knew the two old dark backgrounds. Kept for the other products. */
function legacyIsDark(theme: ThemeTokens): boolean {
  return theme.colors.background === "#020817" || theme.colors.background === "#000000";
}

export function authPalette(theme: ThemeTokens, expenseLook: boolean): AuthPalette {
  if (expenseLook) {
    const c = theme.colors;
    return {
      title: c.foreground,
      muted: c.mutedForeground,
      icon: c.mutedForeground,
      surface: c.card,
      surfaceBorder: c.border,
      surfaceShadow: c.primary,
      link: c.primary,
      linkDisabled: c.mutedForeground,
      divider: c.outlineVariant ?? c.border,
      dividerText: c.mutedForeground,
      cta: [c.primary, c.primary],
      ctaText: c.primaryForeground,
    };
  }
  const dark = legacyIsDark(theme);
  return {
    title: dark ? "#F8FAFC" : "#0B172A",
    muted: dark ? "#94A3B8" : "#64748B",
    icon: dark ? "#94A3B8" : "#64748B",
    surface: dark ? "#1E293B" : "#FFFFFF",
    surfaceBorder: dark ? "#334155" : "#F1F5F9",
    surfaceShadow: dark ? "#000" : "#0875D1",
    link: "#19C79A",
    linkDisabled: "#94A3B8",
    divider: dark ? "#334155" : "#E2E8F0",
    dividerText: dark ? "#64748B" : "#94A3B8",
    cta: ["#0875D1", "#19C79A"],
    ctaText: "#FFFFFF",
  };
}

/** The Google button on the sign-in card. */
export function socialButtonPalette(theme: ThemeTokens, expenseLook: boolean): { background: string; border: string; text: string } {
  if (expenseLook) return { background: theme.colors.card, border: theme.colors.border, text: theme.colors.foreground };
  const dark = legacyIsDark(theme);
  return { background: dark ? "#1E293B" : "#FFFFFF", border: dark ? "#334155" : "#E2E8F0", text: dark ? "#FFFFFF" : "#0F172A" };
}

/** The sign-in background before 556 (gradient base, two blobs, dot grid). */
export function legacyAuthBackground(theme: ThemeTokens) {
  const dark = legacyIsDark(theme);
  return {
    base: dark ? (["#0F172A", "#0B1120"] as const) : (["#F6F9FC", "#FFFFFF"] as const),
    accent1: dark ? "rgba(8, 117, 209, 0.15)" : "rgba(8, 117, 209, 0.08)",
    accent2: dark ? "rgba(25, 199, 154, 0.15)" : "rgba(25, 199, 154, 0.08)",
    dot: dark ? "rgba(255,255,255,0.05)" : "rgba(15, 47, 75, 0.05)",
  };
}
