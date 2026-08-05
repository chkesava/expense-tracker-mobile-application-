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

  // Top offset: Header height (~56) + insets.top
  const topPadding = hideHeaderOffset ? insets.top + theme.space.md : insets.top + 64;
  // Bottom offset: BottomNav/Dock height (~64) + insets.bottom + extra breathing room
  const bottomPadding = hideBottomOffset ? insets.bottom + theme.space.md : insets.bottom + 84;

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.background,
  };

  const dynamicContentStyle: ViewStyle = {
    paddingTop: topPadding,
    paddingBottom: bottomPadding,
    paddingHorizontal: theme.space.md,
  };

  return (
    <View style={[containerStyle, style]}>
      {withAura && <AuraBackground />}

      {scrollable ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[dynamicContentStyle, contentContainerStyle]}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.primary}
                colors={[theme.colors.primary]}
                progressViewOffset={topPadding}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, dynamicContentStyle, contentContainerStyle]}>
          {children}
        </View>
      )}
    </View>
  );
}
