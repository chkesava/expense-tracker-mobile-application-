import {
  bottomChromeClearance,
  type BottomNavStyle,
} from "@/shared/config/bottomChrome";

export type SpendlyBottomClearanceOptions = {
  /**
   * When true (Spendly default under BottomNav), also clear the trailing FAB
   * so sticky footers and last list rows are not covered.
   */
  withFab?: boolean;
  /** Extra breathing room on top of chrome + system inset. */
  extra?: number;
  /**
   * Which bottom chrome the shell is rendering. Defaults to the nav bar, which
   * is what every product other than Spendly's dock layout mounts.
   */
  navStyle?: BottomNavStyle;
};

/**
 * Pure clearance math shared by PageShell, sticky footers, and stack lists.
 * Prefer `useSpendlyBottomClearance` in components; export this for unit tests.
 *
 * The geometry itself lives in `shared/config/bottomChrome`, alongside the
 * offsets the FAB is positioned from, so the two cannot drift (SPENDLY-141).
 */
export function spendlyBottomClearance(
  bottomInset: number,
  { withFab = true, extra = 0, navStyle = "bottom" }: SpendlyBottomClearanceOptions = {}
): number {
  return bottomChromeClearance(bottomInset, { withFab, extra, navStyle });
}

/**
 * Bottom padding for a list that owns its scroll. Inside a PageShell with
 * `listOwnsBottomInset`, the shell's clearance is reused so both stay in
 * sync; standalone stack screens fall back to the Spendly chrome formula.
 */
export function resolveListBottomPadding(
  shellClearance: number | null,
  bottomInset: number,
  extra = 0,
  navStyle: BottomNavStyle = "bottom"
): number {
  if (shellClearance !== null) return shellClearance + extra;
  return spendlyBottomClearance(bottomInset, { withFab: true, extra, navStyle });
}
