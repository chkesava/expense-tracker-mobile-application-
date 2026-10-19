import { Platform, useWindowDimensions } from "react-native";

import {
  SPENDLY_DIALOG_MAX_WIDTH,
  contentMaxWidthOf,
  gridColumnsOf,
  layoutOf,
  sheetPresentationOf,
  sidebarVisible,
  type SpendlyLayout,
} from "@/shared/utils/responsiveLayout";

export type { SpendlyLayout };

const IS_WEB = Platform.OS === "web";

/**
 * Window-driven layout bucket for Spendly (SPENDLY-559).
 *
 * compact < 768 (and all native), medium 768–1023, expanded ≥ 1024 on web.
 * `useWindowDimensions` updates on resize, so layouts switch without a reload.
 */
export function useResponsiveLayout() {
  const { width } = useWindowDimensions();
  const layout = layoutOf(width, IS_WEB);

  return {
    width,
    layout,
    isCompact: layout === "compact",
    isMedium: layout === "medium",
    isExpanded: layout === "expanded",
    showSidebar: sidebarVisible(layout),
    columns: gridColumnsOf(layout),
    wideMaxWidth: contentMaxWidthOf(layout, "wide"),
    readableMaxWidth: contentMaxWidthOf(layout, "readable"),
  };
}

/**
 * Centring cap for a screen that owns its scroll view instead of using
 * PageShell. Spread into `contentContainerStyle`; null on phones and native.
 */
export function useContentWidthStyle(variant: "wide" | "readable" = "wide") {
  const { wideMaxWidth, readableMaxWidth } = useResponsiveLayout();
  const maxWidth = variant === "readable" ? readableMaxWidth : wideMaxWidth;
  return maxWidth === undefined
    ? null
    : { width: "100%" as const, maxWidth, alignSelf: "center" as const };
}

/**
 * Width cap for a hand-rolled RN `<Modal>` sheet: on tablet/desktop web the
 * sheet is centred at dialog width instead of spanning the browser. Spread
 * into the sheet's style; null on phones and native.
 */
export function useSheetWidthStyle() {
  const { layout } = useResponsiveLayout();
  return sheetPresentationOf(layout) === "dialog"
    ? { width: "100%" as const, maxWidth: SPENDLY_DIALOG_MAX_WIDTH, alignSelf: "center" as const }
    : null;
}
