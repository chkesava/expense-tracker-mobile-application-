import {
  BOTTOM_NAV_SCROLL_PADDING,
  BOTTOM_NAV_SCROLL_PADDING_WITH_FAB,
} from "@/components/layout/chrome";

export type SpendlyBottomClearanceOptions = {
  /**
   * When true (Spendly default under BottomNav), also clear the trailing FAB
   * so sticky footers and last list rows are not covered.
   */
  withFab?: boolean;
  /** Extra breathing room on top of chrome + system inset. */
  extra?: number;
};

/**
 * Pure clearance math shared by PageShell, sticky footers, and stack lists.
 * Prefer `useSpendlyBottomClearance` in components; export this for unit tests.
 */
export function spendlyBottomClearance(
  bottomInset: number,
  { withFab = true, extra = 0 }: SpendlyBottomClearanceOptions = {}
): number {
  const chrome = withFab
    ? BOTTOM_NAV_SCROLL_PADDING_WITH_FAB
    : BOTTOM_NAV_SCROLL_PADDING;
  return bottomInset + chrome + extra;
}
