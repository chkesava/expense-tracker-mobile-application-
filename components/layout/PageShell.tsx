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
import {
  APP_BAR_CONTENT_HEIGHT,
  BOTTOM_NAV_SCROLL_PADDING,
} from "./chrome";
import { haptic } from "@/lib/haptics";

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
  withAura?: boolean;
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
  withAura = true,
}: PageShellProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

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
  // Bottom offset: nav bar + clearance + system inset
  const minBottom = hideBottomOffset
    ? insets.bottom + theme.space.md
    : insets.bottom + BOTTOM_NAV_SCROLL_PADDING;

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
      ) : (
        <View style={[{ flex: 1 }, resolvedContentStyle]}>
          {children}
        </View>
      )}
    </View>
  );
}

