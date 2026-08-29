/**
 * Ganesh Seva layout breakpoints.
 *
 * Pure width → bucket mapping so web and native share the same cuts, and so
 * Vitest can cover them. The hook in `hooks/useBreakpoint.ts` is the only
 * place that reads the window.
 *
 * compact  < 600
 * medium   600–1023
 * expanded ≥ 1024
 */
export type GaneshBreakpoint = "compact" | "medium" | "expanded";

export const GANESH_COMPACT_MAX = 600;
export const GANESH_MEDIUM_MAX = 1024;
export const GANESH_WEB_MAX_COMPACT = 720;
export const GANESH_WEB_MAX_EXPANDED = 1100;

export function breakpointOf(width: number): GaneshBreakpoint {
  if (width < GANESH_COMPACT_MAX) return "compact";
  if (width < GANESH_MEDIUM_MAX) return "medium";
  return "expanded";
}

/** Content cap on web: 720 until expanded, then 1100. Native is unconstrained. */
export function ganeshMaxWidthOf(breakpoint: GaneshBreakpoint): number {
  return breakpoint === "expanded" ? GANESH_WEB_MAX_EXPANDED : GANESH_WEB_MAX_COMPACT;
}

/** How many stat tiles fit on one row. */
export function statStripColumnsOf(breakpoint: GaneshBreakpoint): 2 | 3 | 4 {
  if (breakpoint === "compact") return 2;
  if (breakpoint === "medium") return 3;
  return 4;
}
