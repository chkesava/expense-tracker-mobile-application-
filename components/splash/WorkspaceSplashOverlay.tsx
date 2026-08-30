import { GaneshSplashOverlay } from "@/components/ganesh/splash/GaneshSplashOverlay";
import { useWorkspace } from "@/providers/WorkspaceProvider";

import { ProductSplashOverlay as DefaultSplashOverlay } from "./DefaultSplashOverlay";
import type { ProductSplashOverlayProps } from "./types";

/**
 * Combined-app chooser. Single-product Metro aliases never import this file,
 * so Expense/Nutrition builds do not pull Ganesh splash assets.
 */
export function ProductSplashOverlay(props: ProductSplashOverlayProps) {
  const { activeWorkspace, isLoading } = useWorkspace();
  if (isLoading) return null;
  if (activeWorkspace === "ganesh") {
    return <GaneshSplashOverlay {...props} />;
  }
  return <DefaultSplashOverlay {...props} />;
}

export type { ProductSplashOverlayProps };
