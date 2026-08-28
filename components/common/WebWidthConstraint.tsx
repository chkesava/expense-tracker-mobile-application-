import type { ViewStyle } from "react-native";
import { Platform } from "react-native";

/**
 * Caps content width on web so a phone-sized layout doesn't stretch edge to
 * edge on a desktop browser. No-op on native. Spread into a screen's
 * contentStyle/style, not a wrapping component, to avoid an extra native View.
 */
export const webWidthConstraintStyle: ViewStyle | undefined =
  Platform.OS === "web" ? { maxWidth: 480, width: "100%", marginHorizontal: "auto" as unknown as number } : undefined;
