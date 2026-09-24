import { createContext, useContext } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBottomNavStyle } from "@/components/layout/BottomChromeProvider";
import { resolveListBottomPadding } from "@/components/layout/spendlyBottomClearance";

/**
 * Set by PageShell when `listOwnsBottomInset` is on: the bottom clearance the
 * shell no longer applies, so the child list can apply it inside its content.
 */
export const PageShellBottomClearanceContext = createContext<number | null>(null);

/**
 * `contentContainerStyle.paddingBottom` for a list that scrolls under
 * Spendly's floating BottomNav + FAB, so its last row can scroll fully clear.
 */
export function usePageListBottomPadding(extra = 0): number {
  const shellClearance = useContext(PageShellBottomClearanceContext);
  const insets = useSafeAreaInsets();
  const navStyle = useBottomNavStyle();
  return resolveListBottomPadding(shellClearance, insets.bottom, extra, navStyle);
}
