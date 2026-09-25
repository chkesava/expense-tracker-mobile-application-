import type { ThemeTokens } from "./tokens";

/**
 * Gluestack's vendored components colour themselves from CSS variables
 * ("r g b" triplets consumed as `rgb(var(--primary) / <alpha>)`). The stock
 * values in components/ui/gluestack-ui-provider/config.ts are neutral greys,
 * so Spendly maps its own theme onto them — scoped to the Spendly shell so
 * Ganesh Seva and Nutrition keep their defaults (SPENDLY-152).
 */
export type GluestackVarName =
  | "--primary"
  | "--primary-foreground"
  | "--secondary"
  | "--secondary-foreground"
  | "--background"
  | "--foreground"
  | "--card"
  | "--card-foreground"
  | "--popover"
  | "--popover-foreground"
  | "--muted"
  | "--muted-foreground"
  | "--accent"
  | "--accent-foreground"
  | "--destructive"
  | "--destructive-foreground"
  | "--success"
  | "--success-foreground"
  | "--warning"
  | "--warning-foreground"
  | "--border"
  | "--input"
  | "--ring"
  | "--chart-1"
  | "--chart-2"
  | "--chart-3"
  | "--chart-4"
  | "--chart-5";

/** "#4F46FF" / "#FFF" / "rgba(15, 23, 42, 0.5)" -> "79 70 255". Alpha is dropped. */
export function toRgbTriplet(color: string): string | null {
  const value = color.trim();

  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value);
  if (hex) {
    let digits = hex[1];
    if (digits.length <= 4) {
      digits = digits
        .slice(0, 3)
        .split("")
        .map((d) => d + d)
        .join("");
    }
    const r = parseInt(digits.slice(0, 2), 16);
    const g = parseInt(digits.slice(2, 4), 16);
    const b = parseInt(digits.slice(4, 6), 16);
    return `${r} ${g} ${b}`;
  }

  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(value);
  if (rgb) {
    return `${Number(rgb[1])} ${Number(rgb[2])} ${Number(rgb[3])}`;
  }

  return null;
}

export function toGluestackVars(theme: Pick<ThemeTokens, "colors" | "chart">) {
  const c = theme.colors;
  const chart = theme.chart.categorical;
  const source: Record<GluestackVarName, string | undefined> = {
    "--primary": c.primary,
    "--primary-foreground": c.primaryForeground,
    "--secondary": c.secondary,
    "--secondary-foreground": c.secondaryForeground,
    "--background": c.background,
    "--foreground": c.foreground,
    "--card": c.card,
    "--card-foreground": c.cardForeground,
    "--popover": c.card,
    "--popover-foreground": c.cardForeground,
    "--muted": c.muted,
    "--muted-foreground": c.mutedForeground,
    "--accent": c.secondaryContainer,
    "--accent-foreground": c.onSecondaryContainer,
    "--destructive": c.destructive,
    "--destructive-foreground": c.destructiveForeground,
    "--success": c.success,
    "--success-foreground": c.successForeground,
    "--warning": c.warning,
    "--warning-foreground": c.warningForeground,
    "--border": c.border,
    "--input": c.border,
    "--ring": c.primary,
    "--chart-1": chart[0],
    "--chart-2": chart[1],
    "--chart-3": chart[2],
    "--chart-4": chart[3],
    "--chart-5": chart[4],
  };

  const out: Partial<Record<GluestackVarName, string>> = {};
  for (const [name, color] of Object.entries(source) as [GluestackVarName, string | undefined][]) {
    const triplet = color ? toRgbTriplet(color) : null;
    // An unparseable token keeps the inherited (stock) value rather than
    // writing a broken variable.
    if (triplet) out[name] = triplet;
  }
  return out;
}
