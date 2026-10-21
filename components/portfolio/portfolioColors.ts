import { useMemo } from "react";

import type { InstrumentType } from "@/shared/features/portfolio/types";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * SPENDLY-543: one place for the Stocks tab's colours, replacing the
 * `accountScreenTheme` imports and three diverging copies of the instrument
 * palette.
 *
 * - Instrument colours are a data-viz identity ramp (like `categoryRamp`'s
 *   fixed tail): they label a kind of asset, never good or bad, so none of
 *   them is the success green or destructive red.
 * - P&L uses the theme's success / destructive tokens and always rides with a
 *   sign ("+₹1,200", "-0.84%"), never colour alone.
 */
const INSTRUMENT_RAMP: Record<Exclude<InstrumentType, "stock">, string> = {
  etf: "#14B8A6",
  mutual_fund: "#8B5CF6",
  crypto: "#F59E0B",
  gold: "#EAB308",
};

export function usePortfolioColors() {
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  return useMemo(() => {
    const instrument = (type: InstrumentType | string): string =>
      type === "stock"
        ? theme.colors.info
        : INSTRUMENT_RAMP[type as keyof typeof INSTRUMENT_RAMP] ?? theme.colors.mutedForeground;
    const pnl = (value: number): string =>
      value > 0
        ? theme.colors.success
        : value < 0
          ? theme.colors.destructive
          : theme.colors.mutedForeground;
    return {
      instrument,
      pnl,
      /** Raised list surface for holding rows and tab panels. */
      card: theme.colors.card,
      border: theme.colors.outlineVariant,
      inset: surfaces.tile,
      hairline: surfaces.divider,
      /** Order actions. Buy/sell follow the broker convention. */
      buy: theme.colors.success,
      sell: theme.colors.destructive,
      adjust: theme.colors.mutedForeground,
      live: theme.colors.success,
      stale: theme.colors.mutedForeground,
    };
  }, [theme, surfaces]);
}
