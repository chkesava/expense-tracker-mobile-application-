import React, { type ReactNode } from "react";
import {
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

export interface PageShellProps {
  children: ReactNode;
  scrollable?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
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
  style,
  contentContainerStyle,
  hideHeaderOffset = false,
  hideBottomOffset = false,
  withAura = true,
}: PageShellProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

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

  // Top offset: Header height (~56) + insets.top
  const minTop = hideHeaderOffset ? insets.top + theme.space.md : insets.top + 64;
  // Bottom offset: Floating BottomNav/Dock height (~64) + insets.bottom + clearance (108px)
  const minBottom = hideBottomOffset
    ? insets.bottom + theme.space.md
    : insets.bottom + 108;

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
          contentContainerStyle={resolvedContentStyle}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.primary}
                colors={[theme.colors.primary]}
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
