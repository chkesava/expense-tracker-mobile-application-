import { Platform, type ViewStyle } from "react-native";

import { ganeshMaxWidthOf, type GaneshBreakpoint } from "@/shared/utils/ganeshBreakpoint";

/**
 * Ganesh's own web width cap — 720 on compact/medium, 1100 when expanded.
 *
 * Parallel to `components/common/WebWidthConstraint` (480, shared with Expense
 * and Nutrition). Do not edit that file. Spread this onto `GaneshScreen` only;
 * the root Stack must also drop the 480 cap on ganesh routes or a child 720
 * cannot exceed a 480 parent.
 */
export function ganeshWebWidthStyle(breakpoint: GaneshBreakpoint): ViewStyle | undefined {
  if (Platform.OS !== "web") return undefined;
  return {
    width: "100%",
    maxWidth: ganeshMaxWidthOf(breakpoint),
    alignSelf: "center",
  };
}
