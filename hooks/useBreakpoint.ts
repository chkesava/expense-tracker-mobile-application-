import { useWindowDimensions } from "react-native";

import {
  breakpointOf,
  ganeshMaxWidthOf,
  statStripColumnsOf,
  type GaneshBreakpoint,
} from "@/shared/utils/ganeshBreakpoint";

export type { GaneshBreakpoint };

/**
 * Window-driven layout bucket for Ganesh Seva.
 *
 * compact < 600, medium 600–1023, expanded ≥ 1024. Use `twoCol` for section
 * pairs and `columns` for stat strips. Do not store the width in state —
 * `useWindowDimensions` already updates on rotate/resize.
 */
export function useBreakpoint() {
  const { width, height } = useWindowDimensions();
  const breakpoint = breakpointOf(width);

  return {
    width,
    height,
    breakpoint,
    isCompact: breakpoint === "compact",
    isMedium: breakpoint === "medium",
    isExpanded: breakpoint === "expanded",
    twoCol: breakpoint !== "compact",
    columns: statStripColumnsOf(breakpoint),
    maxWidth: ganeshMaxWidthOf(breakpoint),
  };
}
