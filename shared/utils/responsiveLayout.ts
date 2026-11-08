/**
 * Spendly (Expense) responsive layout buckets (SPENDLY-559).
 *
 * Pure width → bucket mapping so the cuts are provable in Vitest. The hook in
 * `hooks/useResponsiveLayout.ts` is the only place that reads the window.
 *
 * compact  < 768   today's phone layout, bottom nav (and every native device)
 * medium   768–1023 bottom nav, wider centred content, two-column grids
 * expanded ≥ 1024  left sidebar, three-column grids
 *
 * Wide layouts are web-only by decision: native phones and tablets always get
 * `compact`, so a web fix can never change the native app. The bucket still
 * comes from the live viewport width, not from the platform alone.
 *
 * Ganesh Seva has its own cuts (`shared/utils/ganeshBreakpoint.ts`); the two
 * products are deliberately independent.
 */
export type SpendlyLayout = "compact" | "medium" | "expanded";

export const SPENDLY_MEDIUM_MIN = 768;
export const SPENDLY_EXPANDED_MIN = 1024;

/** Width of the desktop navigation sidebar. */
export const SPENDLY_SIDEBAR_WIDTH = 232;

export function layoutOf(width: number, isWeb: boolean): SpendlyLayout {
  if (!isWeb) return "compact";
  if (width < SPENDLY_MEDIUM_MIN) return "compact";
  if (width < SPENDLY_EXPANDED_MIN) return "medium";
  return "expanded";
}

/**
 * `wide` suits hubs and lists; `readable` suits forms, settings and long
 * text, which get hard to scan when stretched. `dashboard` is the Expense
 * dashboard (SPENDLY-718): wide below 1280, then room for its desktop
 * composition on large monitors.
 */
export type ContentWidthVariant = "wide" | "readable" | "dashboard";

const WIDE_MAX: Record<SpendlyLayout, number | undefined> = {
  compact: undefined,
  medium: 960,
  expanded: 1280,
};
const READABLE_MAX = 720;
/**
 * SPENDLY-718: the desktop dashboard's cap. A 1920 monitor leaves a 1688
 * page column beside the sidebar, so the cap only bites on ultrawide screens.
 */
export const DASHBOARD_MAX = 1680;

/** Content cap, or `undefined` for full width (compact keeps today's layout). */
export function contentMaxWidthOf(
  layout: SpendlyLayout,
  variant: ContentWidthVariant = "wide"
): number | undefined {
  if (layout === "compact") return undefined;
  if (variant === "readable") return READABLE_MAX;
  if (variant === "dashboard" && layout === "expanded") return DASHBOARD_MAX;
  return WIDE_MAX[layout];
}

/**
 * SPENDLY-718: the dashboard switches to its desktop composition (net worth
 * beside the totals and quick actions, two analytics columns, three lower
 * cards) from this viewport width. Below it, the SPENDLY-559 grid stays.
 */
export const DASHBOARD_DESKTOP_MIN = 1280;

export function isDesktopDashboard(width: number, isWeb: boolean): boolean {
  return isWeb && width >= DASHBOARD_DESKTOP_MIN;
}

/** How many columns a card grid uses. Compact is always one column. */
export function gridColumnsOf(layout: SpendlyLayout, maxColumns: 1 | 2 | 3 = 3): 1 | 2 | 3 {
  const natural = layout === "expanded" ? 3 : layout === "medium" ? 2 : 1;
  return Math.min(natural, maxColumns) as 1 | 2 | 3;
}

/** The sidebar replaces the bottom nav, dock and swipe-tabs at expanded. */
export function sidebarVisible(layout: SpendlyLayout): boolean {
  return layout === "expanded";
}

/**
 * Bottom sheets become centred dialogs above compact: a sheet spanning a
 * desktop browser is hard to read and far from the pointer.
 */
export function sheetPresentationOf(layout: SpendlyLayout): "sheet" | "dialog" {
  return layout === "compact" ? "sheet" : "dialog";
}

/** Width cap for a sheet presented as a dialog. */
export const SPENDLY_DIALOG_MAX_WIDTH = 560;
