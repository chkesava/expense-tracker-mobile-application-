import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  spendlyBottomClearance,
  type SpendlyBottomClearanceOptions,
} from "@/components/layout/spendlyBottomClearance";

export type { SpendlyBottomClearanceOptions };
export { spendlyBottomClearance };

/**
 * Bottom padding so content clears Spendly's absolute BottomNav (and FAB)
 * plus the system home-indicator inset. Same formula PageShell uses.
 */
export function useSpendlyBottomClearance(
  options: SpendlyBottomClearanceOptions = {}
): number {
  const insets = useSafeAreaInsets();
  return spendlyBottomClearance(insets.bottom, options);
}
