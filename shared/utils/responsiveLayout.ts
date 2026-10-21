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
 * `wide` suits dashboards, hubs and lists; `readable` suits forms, settings
 * and long text, which get hard to scan when stretched.
 */
export type ContentWidthVariant = "wide" | "readable";

const WIDE_MAX: Record<SpendlyLayout, number | undefined> = {
  compact: undefined,
  medium: 960,
  expanded: 1280,
};
const READABLE_MAX = 720;

/** Content cap, or `undefined` for full width (compact keeps today's layout). */
export function contentMaxWidthOf(
  layout: SpendlyLayout,
  variant: ContentWidthVariant = "wide"
): number | undefined {
  if (layout === "compact") return undefined;
  return variant === "readable" ? READABLE_MAX : WIDE_MAX[layout];
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
