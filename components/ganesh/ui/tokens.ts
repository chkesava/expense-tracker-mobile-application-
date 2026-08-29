/**
 * Ganesh Seva design tokens.
 *
 * Ganesh Seva owns its whole visual language: the palette comes from
 * `theme/ganeshPalette.ts` (published to the subtree by `GaneshThemeProvider`),
 * and the surfaces come from `./surfaces`. Nothing here depends on the Expense
 * Tracker.
 *
 * This module adds the vocabulary the palette alone cannot express:
 *
 * - **Saffron / maroon / gold** — festival identity. Saffron is the same value
 *   as `colors.primary`; it is named here so screens can say what they mean.
 * - **Fund kinds** — which pot of money a value belongs to. God Fund money and
 *   a member's personal money are genuinely different things to a treasurer,
 *   and the distinction always carries a text label, never colour alone.
 * - **Seva kinds** — a colour and meaning per kind of pandal activity.
 *
 * Rule: colour marks actions, identity and status. Amounts stay in
 * `foreground`.
 */

import {
  GANESH_RADIUS,
  GANESH_SPACE,
  useSurfaces,
  withAlpha,
} from "./surfaces";
import type { SevaKind } from "@/shared/types/ganesh";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export { GANESH_RADIUS, GANESH_SPACE, withAlpha };

/** Which pot of money a value belongs to. Drives tone, never colour alone. */
export type FundKind = "god" | "personal" | "permanent" | "inKind";

export type GaneshTokens = {
  isDark: boolean;
  /** Festival accent — primary actions, active tab, selected chip. */
  saffron: string;
  /** Permanent Pandal Fund identity. Used nowhere else. */
  maroon: string;
  /** Temple gold — section rules and the hero arch. Never used for text. */
  gold: string;
  /** God Fund money. */
  godFund: string;
  /** Money fronted by a member, awaiting reimbursement. */
  personal: string;
  /** Promised / not-yet-cash value. */
  promised: string;
  /** Tint any of the above down to a background wash. */
  wash: (hex: string) => string;
  /** Inset tile fill (matches section tiles). */
  tile: string;
  /** Hairline divider. */
  divider: string;
  /** Progress / meter track. */
  track: string;
  /** Android ripple colour over a surface. */
  ripple: string;
  fundColor: (kind: FundKind) => string;
  fundLabel: (kind: FundKind) => string;
  sevaColor: (kind: SevaKind) => string;
};

export function useGaneshTokens(): GaneshTokens {
  const { theme, themeName } = useTheme();
  const surfaces = useSurfaces();
  const isDark = themeUsesDarkPalette(themeName);

  // Saffron is the palette's primary; naming it keeps screens readable.
  const saffron = theme.colors.primary;
  const maroon = isDark ? "#F0A7BE" : "#7B1D3A";
  const gold = isDark ? "#E0B558" : "#B98029";
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

  /**
   * A colour per kind of seva. Deliberately a small, warm set — a schedule
   * should read as one festival, not a category chart. Every seva row also
   * carries its icon and name, so colour is never the only signal.
   */
  const sevaColor = (kind: SevaKind): string => {
    switch (kind) {
      case "aarti":
        return saffron;
      case "annadanam":
      case "prasadam":
        return godFund;
      case "bhajan":
      case "cultural":
        return maroon;
      case "decoration":
        return gold;
      case "security":
        return personal;
      case "cleaning":
        return theme.colors.mutedForeground;
      case "procession":
      case "visarjan":
        return promised;
      default:
        return theme.colors.mutedForeground;
    }
  };

  return {
    isDark,
    saffron,
    maroon,
    gold,
    godFund,
    personal,
    promised,
    wash: surfaces.wash,
    tile: surfaces.tile,
    divider: surfaces.divider,
    track: surfaces.track,
    ripple: surfaces.ripple,
    fundColor,
    fundLabel,
    sevaColor,
  };
}
