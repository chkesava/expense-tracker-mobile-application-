/**
 * Ganesh Seva UI kit — the single import site for every Ganesh screen.
 *
 * The surfaces below are Ganesh's own (`./surfaces`), forked from the Expense
 * Tracker's dashboard primitives and now fully independent of them. Ganesh Seva
 * is a pandal operating platform, not a re-themed expense tracker, so the two
 * design systems are allowed — required — to diverge. Nothing under
 * `components/ganesh/` may import from `components/dashboard/`.
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
  useGaneshSurfaceAccents,
  withAlpha,
  toneColor,
  GANESH_RADIUS,
  GANESH_SPACE,
  type Tone,
} from "./surfaces";

export { useGaneshTokens, type FundKind, type GaneshTokens } from "./tokens";
export { Money, type MoneyProps, type MoneySize } from "./Money";
export { FilterChips, type ChipOption, type FilterChipsProps } from "./FilterChips";
export { StatusBadge, statusLabel, type StatusKind } from "./StatusBadge";
export { LedgerRow, type LedgerRowProps, type LedgerRowBadge } from "./LedgerRow";
export { FundHero, type FundHeroProps, type FundBreakdownItem } from "./FundHero";
export { GaneshHeader, type GaneshHeaderProps } from "./GaneshHeader";
export { ListStateView, type ListStateViewProps } from "./ListStateView";
export { NavRow, type NavRowProps } from "./NavRow";
export { Avatar, initialsOf, type AvatarProps } from "./Avatar";
export { GaneshMark } from "./GaneshMark";
export { GaneshAuthBackground } from "./GaneshAuthBackground";
export { ArchFrame } from "./ArchFrame";
export { PandalHero } from "./PandalHero";
export { PandalIdentity } from "./PandalIdentity";
export {
  GaneshEmptyState,
  type GaneshEmptyAction,
  type GaneshEmptyStateProps,
} from "./GaneshEmptyState";
export { SevaGlyph, sevaIcon, sevaKindLabel, SEVA_KINDS } from "./SevaGlyph";
export { ganeshWebWidthStyle } from "./GaneshWidthConstraint";
export { StatStrip } from "./StatStrip";
export { SectionPair } from "./SectionPair";
