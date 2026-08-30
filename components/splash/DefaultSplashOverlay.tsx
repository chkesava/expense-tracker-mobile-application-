import { SplashAnimationOverlay } from "@/components/common/SplashAnimationOverlay";

import type { ProductSplashOverlayProps } from "./types";

/**
 * Expense / Nutrition / combined startup overlay.
 * Extra Ganesh-only props are ignored so the existing animation is unchanged.
 */
export function ProductSplashOverlay({
  onAnimationComplete,
}: ProductSplashOverlayProps) {
  return <SplashAnimationOverlay onAnimationComplete={onAnimationComplete} />;
}

export type { ProductSplashOverlayProps };
