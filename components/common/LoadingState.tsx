import React from "react";
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { SkeletonCard, SkeletonChart, SkeletonHero, SkeletonList } from "./Skeleton";

export type LoadingVariant = "list" | "card" | "hero" | "chart" | "spinner";

export type LoadingStateProps = {
  label?: string;
  variant?: LoadingVariant;
  count?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Polished loading state with animated skeleton placeholders or optional spinner.
 */
export function LoadingState({
  label,
  variant = "list",
  count = 4,
  style,
}: LoadingStateProps) {
  const { theme } = useTheme();

  if (variant === "spinner") {
    return (
      <View style={[styles.wrap, { padding: theme.space.xl, gap: theme.space.sm }, style]}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
        {label ? (
          <Text
            style={{
              color: theme.colors.mutedForeground,
              fontSize: theme.typography.sm,
              fontFamily: theme.fontFamily.regular,
            }}
          >
            {label}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.skeletonContainer, style]}>
      {variant === "hero" && (
        <View style={{ gap: 14 }}>
          <SkeletonHero />
          <SkeletonList count={count} />
        </View>
      )}

      {variant === "card" && (
        <View style={{ gap: 12 }}>
          {Array.from({ length: count }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      )}

      {variant === "chart" && (
        <View style={{ gap: 14 }}>
          <SkeletonChart />
          <SkeletonList count={count} />
        </View>
      )}

      {variant === "list" && <SkeletonList count={count} />}

      {label ? (
        <Text
          style={{
            textAlign: "center",
            color: theme.colors.mutedForeground,
            fontSize: theme.typography.sm,
            fontFamily: theme.fontFamily.regular,
            marginTop: 8,
          }}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
}

export default LoadingState;

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  skeletonContainer: {
    width: "100%",
    paddingVertical: 8,
  },
});
