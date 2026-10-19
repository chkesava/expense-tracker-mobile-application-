import React, { type ReactNode } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { AuraBackground } from "./AuraBackground";
import { APP_BAR_CONTENT_HEIGHT } from "./chrome";
import { PageShellBottomClearanceContext } from "./usePageListBottomPadding";
import { useSpendlyBottomClearance } from "./useSpendlyBottomClearance";
import { haptic } from "@/lib/haptics";
import { useContentWidthStyle } from "@/hooks/useResponsiveLayout";
import type { ContentWidthVariant } from "@/shared/utils/responsiveLayout";

export interface PageShellProps {
  children: ReactNode;
  scrollable?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  onScrollBeginDrag?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  hideHeaderOffset?: boolean;
  hideBottomOffset?: boolean;
  /**
   * With `scrollable={false}`: the child list extends behind the floating
   * BottomNav/FAB and applies the clearance itself via
   * `usePageListBottomPadding`, instead of the shell padding its outer View.
   */
  listOwnsBottomInset?: boolean;
  withAura?: boolean;
  /**
   * SPENDLY-559: how wide the content may grow on tablet/desktop web.
   * `wide` (default) for hubs and lists, `readable` for forms and settings.
   * Phones and native are never capped.
   */
  layout?: ContentWidthVariant;
}

export function PageShell({
  children,
  scrollable = true,
  refreshing = false,
  onRefresh,
  onScrollBeginDrag,
  style,
  contentContainerStyle,
  hideHeaderOffset = false,
  hideBottomOffset = false,
  listOwnsBottomInset = false,
  withAura = true,
  layout = "wide",
}: PageShellProps) {
  const { theme } = useTheme();
  const contentWidthStyle = useContentWidthStyle(layout);
  const insets = useSafeAreaInsets();
  const bottomClearance = useSpendlyBottomClearance({ withFab: true });

  const handleRefresh = () => {
    if (!onRefresh) return;
    haptic.medium().catch(() => undefined);
    onRefresh();
  };

  // Compute required safe top and bottom clearances
  const userContentStyle = StyleSheet.flatten(contentContainerStyle) || {};
  const customPaddingBottom =
    typeof userContentStyle.paddingBottom === "number"
      ? userContentStyle.paddingBottom
      : 0;
  const customPaddingTop =
    typeof userContentStyle.paddingTop === "number"
      ? userContentStyle.paddingTop
      : 0;

  // Top offset: compact app bar (56) + status-bar inset + breathing room
  const minTop = hideHeaderOffset
    ? insets.top + theme.space.md
    : insets.top + APP_BAR_CONTENT_HEIGHT + theme.space.sm;
  // Bottom offset: shared chrome helper (nav + FAB + inset), or inset-only
  // when the screen opts out of BottomNav clearance.
  const minBottom = hideBottomOffset
    ? insets.bottom + theme.space.md
    : bottomClearance;

  const effectivePaddingTop = Math.max(minTop, customPaddingTop);
  const effectivePaddingBottom = Math.max(minBottom, customPaddingBottom);

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.background,
  };

  const dynamicContentStyle: ViewStyle = {
    paddingHorizontal: theme.space.md,
  };

  const resolvedContentStyle = [
    dynamicContentStyle,
    contentContainerStyle,
    {
      paddingTop: effectivePaddingTop,
      paddingBottom: effectivePaddingBottom,
    },
    // Centred and capped above compact; absent on phones, so they are unchanged.
    contentWidthStyle,
  ];

  return (
    <View style={[containerStyle, style]}>
      {withAura && <AuraBackground />}

      {scrollable ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={resolvedContentStyle}
          onScrollBeginDrag={onScrollBeginDrag}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={theme.colors.primary}
                colors={[theme.colors.primary]}
                progressBackgroundColor={theme.colors.card}
                progressViewOffset={effectivePaddingTop}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : listOwnsBottomInset ? (
        <PageShellBottomClearanceContext.Provider value={effectivePaddingBottom}>
          <View style={[{ flex: 1 }, resolvedContentStyle, { paddingBottom: 0 }]}>
            {children}
          </View>
        </PageShellBottomClearanceContext.Provider>
      ) : (
        <View style={[{ flex: 1 }, resolvedContentStyle]}>
          {children}
        </View>
      )}
    </View>
  );
}

