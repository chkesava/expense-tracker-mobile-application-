import React, { useEffect } from "react";
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";

import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number | `${number}%`;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Base animated skeleton element using Reanimated pulse worklet.
 */
export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius,
  style,
}: SkeletonProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.85, {
          duration: 900,
          easing: Easing.bezier(0.4, 0, 0.6, 1),
        }),
        withTiming(0.35, {
          duration: 900,
          easing: Easing.bezier(0.4, 0, 0.6, 1),
        })
      ),
      -1,
      true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const baseColor = isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.08)";

  return (
    <Animated.View
      accessibilityLabel="Loading content"
      style={[
        {
          width,
          height,
          borderRadius: borderRadius ?? theme.radius.sm,
          backgroundColor: baseColor,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

/**
 * Skeleton container mimicking standard Card component.
 */
export function SkeletonCard({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      {children || (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Skeleton width="45%" height={18} borderRadius={6} />
            <Skeleton width="20%" height={16} borderRadius={12} />
          </View>
          <Skeleton width="90%" height={14} borderRadius={4} />
          <Skeleton width="70%" height={14} borderRadius={4} />
        </View>
      )}
    </View>
  );
}

/**
 * Skeleton list item mimicking transaction or ledger row.
 */
export function SkeletonListItem({
  hasAvatar = true,
  style,
}: {
  hasAvatar?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.listItem,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      {hasAvatar && (
        <Skeleton width={40} height={40} borderRadius={20} />
      )}
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="60%" height={15} borderRadius={4} />
        <Skeleton width="35%" height={11} borderRadius={3} />
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <Skeleton width={68} height={16} borderRadius={4} />
        <Skeleton width={44} height={10} borderRadius={3} />
      </View>
    </View>
  );
}

/**
 * Skeleton repeating list for full-page feeds.
 */
export function SkeletonList({
  count = 4,
  style,
}: {
  count?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ gap: 10 }, style]}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonListItem key={index} />
      ))}
    </View>
  );
}

/**
 * Skeleton hero banner for Overview, Debt, Subscriptions, and Trips summaries.
 */
export function SkeletonHero({ style }: { style?: StyleProp<ViewStyle> }) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  return (
    <View
      style={[
        styles.hero,
        {
          backgroundColor: theme.colors.card,
          borderColor: isDark ? "rgba(107, 99, 255, 0.25)" : "rgba(79, 70, 255, 0.15)",
        },
        style,
      ]}
    >
      {/* Top row */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Skeleton width={110} height={14} borderRadius={4} />
        <Skeleton width={75} height={24} borderRadius={12} />
      </View>

      {/* Amount number */}
      <View style={{ marginVertical: 8 }}>
        <Skeleton width={180} height={34} borderRadius={8} />
      </View>

      {/* Sub-metrics strip */}
      <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
        <Skeleton width="48%" height={48} borderRadius={10} />
        <Skeleton width="48%" height={48} borderRadius={10} />
      </View>
    </View>
  );
}

/**
 * Skeleton chart placeholder for bar/spending curve cards.
 */
export function SkeletonChart({
  height = 180,
  style,
}: {
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const barHeights = [45, 75, 30, 90, 60, 80, 50];

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          height: height + 60,
        },
        style,
      ]}
    >
      {/* Header */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 16 }}>
        <Skeleton width={120} height={16} borderRadius={4} />
        <Skeleton width={60} height={16} borderRadius={8} />
      </View>

      {/* Bar Columns */}
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          paddingHorizontal: 8,
          gap: 8,
        }}
      >
        {barHeights.map((pct, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center", gap: 6 }}>
            <Skeleton width="100%" height={`${pct}%`} borderRadius={6} />
            <Skeleton width={20} height={8} borderRadius={2} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Skeleton donut / distribution placeholder.
 */
export function SkeletonDonut({ style }: { style?: StyleProp<ViewStyle> }) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          alignItems: "center",
          gap: 16,
        },
        style,
      ]}
    >
      <View style={{ width: "100%", flexDirection: "row", justifyContent: "space-between" }}>
        <Skeleton width={140} height={16} borderRadius={4} />
        <Skeleton width={50} height={16} borderRadius={8} />
      </View>
      <Skeleton width={140} height={140} borderRadius={70} />
      <View style={{ width: "100%", flexDirection: "row", justifyContent: "space-around" }}>
        <Skeleton width={60} height={12} borderRadius={4} />
        <Skeleton width={60} height={12} borderRadius={4} />
        <Skeleton width={60} height={12} borderRadius={4} />
      </View>
    </View>
  );
}

export default Skeleton;

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    overflow: "hidden",
  },
  hero: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    overflow: "hidden",
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
});
