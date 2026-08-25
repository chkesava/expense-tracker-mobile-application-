/**
 * Ganesh Seva UI kit.
 *
 * Ganesh-specific components live here; everything else is re-exported straight
 * from the Expense Tracker's dashboard primitives so screens have one import
 * site and there is never a second, divergent design system.
 */

export {
  Section,
  SectionAction,
  StatTile,
  DataRow,
  RowGlyph,
  MetaLabel,
  Pill,
  StatusStrip,
  ProgressTrack,
  TrendText,
  useSurfaces,
  withAlpha,
  toneColor,
  DASH_RADIUS as GANESH_RADIUS,
  DASH_SPACE as GANESH_SPACE,
  type Tone,
} from "@/components/dashboard/primitives";

export { useGaneshTokens, type FundKind, type GaneshTokens } from "./tokens";
export { Money, type MoneyProps, type MoneySize } from "./Money";
export { FilterChips, type ChipOption, type FilterChipsProps } from "./FilterChips";
export { StatusBadge, statusLabel, type StatusKind } from "./StatusBadge";
export { LedgerRow, type LedgerRowProps, type LedgerRowBadge } from "./LedgerRow";
export { FundHero, type FundHeroProps, type FundBreakdownItem } from "./FundHero";
export { GaneshHeader, type GaneshHeaderProps } from "./GaneshHeader";
export { ListStateView, type ListStateViewProps } from "./ListStateView";
export { NavRow, type NavRowProps } from "./NavRow";
export { MoreDetails, type MoreDetailsProps } from "./MoreDetails";
export { FormShell, type FormShellProps } from "./FormShell";
export { Avatar, initialsOf, type AvatarProps } from "./Avatar";
export { GaneshMark } from "./GaneshMark";
export { GaneshAuthBackground } from "./GaneshAuthBackground";
