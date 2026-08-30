import { Platform, StatusBar, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/theme/ThemeProvider";

const FALLBACK_INSET = Platform.select({ ios: 47, android: 24, default: 0 }) ?? 0;

/**
 * Height of the system status bar (clock, battery, signal).
 *
 * Safe-area insets are preferred. On Android edge-to-edge they are sometimes
 * reported as 0, so we fall back to `StatusBar.currentHeight`.
 */
export function useGaneshStatusBarInset(): number {
  const insets = useSafeAreaInsets();
  if (Platform.OS === "web") {
    return Math.max(0, insets.top);
  }

  const androidBar = Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0;
  const measured = Math.max(insets.top, androidBar);
  return measured > 0 ? measured : FALLBACK_INSET;
}

/**
 * Reserved strip above Ganesh chrome so the system status bar sits on the
 * screen background instead of maroon artwork.
 */
export function GaneshStatusBarGap() {
  const { theme } = useTheme();
  const height = useGaneshStatusBarInset();
  if (height <= 0) return null;

  return (
    <View
      style={{ height, backgroundColor: theme.colors.background }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    />
  );
}
