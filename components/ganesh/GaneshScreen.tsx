import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GaneshStatusBarGap } from "@/components/ganesh/chrome/GaneshStatusBarGap";
import { ganeshWebWidthStyle } from "@/components/ganesh/ui/GaneshWidthConstraint";
import { BOTTOM_NAV_SCROLL_PADDING } from "@/components/layout/chrome";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Bottom padding a Ganesh list must reserve so its last row clears the tab bar
 * and the system gesture inset. Mirrors what `PageShell` computes for the
 * Expense Tracker.
 */
export function useGaneshListPadding(withTabBar = true): number {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  return withTabBar
    ? insets.bottom + BOTTOM_NAV_SCROLL_PADDING
    : Math.max(insets.bottom, theme.space.lg) + theme.space.xl;
}

export type GaneshScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  /** Extra top breathing room. The status-bar gap is always reserved by the shell. */
  safeTop?: boolean;
  /** Reserve clearance for the Ganesh tab bar. */
  withTabBar?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  /** Rendered outside the scroll area — FABs, docked bars. */
  overlay?: ReactNode;
};

/**
 * The Ganesh screen shell.
 *
 * Derives its offsets from the shared `chrome.ts` metrics instead of hardcoded
 * numbers, and supports pull-to-refresh with the same haptic + tint treatment
 * as `PageShell`, so a Ganesh screen behaves exactly like an Expense Tracker one.
 */
export function GaneshScreen({
  children,
  scroll = true,
  safeTop = false,
  withTabBar = false,
  refreshing = false,
  onRefresh,
  contentContainerStyle,
  style,
  overlay,
}: GaneshScreenProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { breakpoint } = useBreakpoint();
  const widthStyle = ganeshWebWidthStyle(breakpoint);

  const paddingTop = theme.space.lg + (safeTop ? theme.space.sm : 0);
  const paddingBottom = withTabBar
    ? insets.bottom + BOTTOM_NAV_SCROLL_PADDING
    : Math.max(insets.bottom, theme.space.lg) + theme.space.xl;

  const content: ViewStyle = {
    paddingTop,
    paddingHorizontal: theme.space.lg,
    paddingBottom: scroll ? paddingBottom : 0,
    // List screens stack a header, hero, search and chips above the list, so
    // they use the tighter rhythm; scrolling screens get the full section gap.
    gap: scroll ? theme.space.lg : theme.space.md,
  };

  const handleRefresh = () => {
    if (!onRefresh) return;
    void haptic.medium();
    onRefresh();
  };

  return (
    <KeyboardAvoidingView
      // Every Ganesh money form — expense, collection, contribution — renders
      // inside this shell, so the amount field and the save button used to sit
      // behind the keyboard on a small phone (GS-033). Fixing it here fixes it
      // once, for all of them.
      //
      // iOS only, matching `components/common/Modal.tsx`: the Android activity
      // is `windowSoftInputMode="adjustResize"`, so the ScrollView already
      // shrinks and scrolls the focused input into view. Adding padding on top
      // of that double-counts the keyboard.
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.fill, { backgroundColor: theme.colors.background }, widthStyle, style]}
    >
      <GaneshStatusBarGap />
      {scroll ? (
        <ScrollView
          style={styles.fill}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[content, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={theme.colors.primary}
                colors={[theme.colors.primary]}
                progressBackgroundColor={theme.colors.card}
                progressViewOffset={paddingTop}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, content, contentContainerStyle]}>{children}</View>
      )}
      {overlay}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
