/**
 * Ganesh Seva design tokens.
 *
 * Ganesh Seva is a sibling of the Expense Tracker, not a second design system.
 * Radius, spacing, surfaces and the semantic `Tone` vocabulary all come from
 * `components/dashboard/primitives` — the Expense Tracker's layout language.
 *
 * The only thing added here is a *festival identity*: one warm saffron accent
 * plus a maroon reserved for the Permanent Fund, and the fund-type tones that
 * distinguish God Fund money from a member's personal money.
 *
 * Rule: the accent marks actions and identity. Amounts stay in `foreground`.
 */

import {
  DASH_RADIUS,
  DASH_SPACE,
  useSurfaces,
  withAlpha,
} from "@/components/dashboard/primitives";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export { DASH_RADIUS as GANESH_RADIUS, DASH_SPACE as GANESH_SPACE, withAlpha };

/** Which pot of money a value belongs to. Drives tone, never colour alone. */
export type FundKind = "god" | "personal" | "permanent" | "inKind";

export type GaneshTokens = {
  isDark: boolean;
  /** Festival accent — primary actions, active tab, selected chip. */
  saffron: string;
  /** Permanent Pandal Fund identity. Used nowhere else. */
  maroon: string;
  /** God Fund money. */
  godFund: string;
  /** Money fronted by a member, awaiting reimbursement. */
  personal: string;
  /** Promised / not-yet-cash value. */
  promised: string;
  /** Tint any of the above down to a background wash. */
  wash: (hex: string) => string;
  /** Inset tile fill (matches dashboard tiles). */
  tile: string;
  /** Hairline divider. */
  divider: string;
  /** Progress / meter track. */
  track: string;
  fundColor: (kind: FundKind) => string;
  fundLabel: (kind: FundKind) => string;
};

export function useGaneshTokens(): GaneshTokens {
  const { theme, themeName } = useTheme();
  const surfaces = useSurfaces();
  const isDark = themeUsesDarkPalette(themeName);

  const saffron = isDark ? "#FB923C" : "#C2410C";
  const maroon = isDark ? "#F0A7BE" : "#7B1D3A";
  const godFund = theme.colors.success;
  const personal = theme.colors.info;
  const promised = theme.colors.warning;

  const fundColor = (kind: FundKind): string => {
    switch (kind) {
      case "personal":
        return personal;
      case "permanent":
        return maroon;
      case "inKind":
        return promised;
      default:
        return godFund;
    }
  };

  const fundLabel = (kind: FundKind): string => {
    switch (kind) {
      case "personal":
        return "Personal Money";
      case "permanent":
        return "Permanent Fund";
      case "inKind":
        return "In-kind";
      default:
        return "God Fund";
    }
  };

  return {
    isDark,
    saffron,
    maroon,
    godFund,
    personal,
    promised,
    wash: surfaces.wash,
    tile: surfaces.tile,
    divider: surfaces.divider,
    track: surfaces.track,
    fundColor,
    fundLabel,
  };
}
