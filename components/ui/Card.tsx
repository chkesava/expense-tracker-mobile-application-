import React, { type ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { EmptyState, type EmptyActionConfig } from "@/components/common/EmptyState";
import { type EmptyIllustrationType } from "@/components/common/EmptyStateIllustration";
import { Skeleton } from "@/components/common/Skeleton";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";

export type CardVariant = "outlined" | "elevated" | "filled" | "tonal";
export type CardElevation = 0 | 1 | 2 | 3 | 4 | 5;
export type CardRadius = "sm" | "md" | "lg" | "xl" | "xxl" | "full";

export type CardProps = {
  children?: ReactNode;
  title?: string;
  subtitle?: string;
  badge?: string | ReactNode;
  icon?: ReactNode;
  headerRight?: ReactNode;
  footer?: ReactNode;
  variant?: CardVariant;
  elevation?: CardElevation;
  radius?: CardRadius | number;
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  interactive?: boolean;
  disabled?: boolean;
  loading?: boolean;
  loadingSkeleton?: ReactNode;
  skeletonLines?: number;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIllustration?: EmptyIllustrationType;
  emptyAction?: EmptyActionConfig;
  emptySecondaryAction?: EmptyActionConfig;
  emptyTip?: string;
  emptyNode?: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Card({
  children,
  title,
  subtitle,
  badge,
  icon,
  headerRight,
  footer,
  variant = "outlined",
  elevation,
  radius,
  onPress,
  onLongPress,
  interactive,
  disabled = false,
  loading = false,
  loadingSkeleton,
  skeletonLines = 2,
  empty = false,
  emptyTitle,
  emptyDescription,
  emptyIllustration,
  emptyAction,
  emptySecondaryAction,
  emptyTip,
  emptyNode,
  style,
  contentStyle,
  testID,
}: CardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const isInteractive = (interactive ?? Boolean(onPress || onLongPress)) && !disabled;

  // Spring animation for press feedback
  const scale = useSharedValue(1);

  const animatedScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (isInteractive) {
      scale.value = withSpring(0.982, { damping: 18, stiffness: 320, mass: 0.5 });
    }
  };

  const handlePressOut = () => {
    if (isInteractive) {
      scale.value = withSpring(1, { damping: 18, stiffness: 320, mass: 0.5 });
    }
  };

  const handlePress = (e: GestureResponderEvent) => {
    if (!onPress || disabled) return;
    haptic.light().catch(() => undefined);
    onPress(e);
  };

  const handleLongPress = (e: GestureResponderEvent) => {
    if (!onLongPress || disabled) return;
    haptic.medium().catch(() => undefined);
    onLongPress(e);
  };

  // Resolve border radius
  const resolvedRadius =
    typeof radius === "number"
      ? radius
      : radius === "sm"
        ? theme.radius.sm
        : radius === "md"
          ? theme.radius.md
          : radius === "lg"
            ? theme.radius.lg
            : radius === "xxl"
              ? 24
              : radius === "full"
                ? 28
                : theme.radius.xl; // Default: 20dp (MD3 standard)

  // Resolve elevation
  const isTonal = variant === "tonal" || variant === "filled";
  const isElevated = variant === "elevated";
  const isOutlined = variant === "outlined";

  const resolvedElevationLevel: CardElevation =
    elevation !== undefined ? elevation : isElevated ? 2 : isTonal ? 0 : 1;

  const elevationStyle = theme.elevation[resolvedElevationLevel];

  // Resolve background with MD3 dark surface tinting
  let backgroundColor: string = isTonal
    ? theme.colors.surfaceVariant
    : theme.colors.card;

  if (isDark && resolvedElevationLevel >= 2 && !isTonal) {
    backgroundColor = resolvedElevationLevel >= 3 ? "#222530" : "#1C1E26";
  }

  const borderColor = isOutlined
    ? theme.colors.outlineVariant ?? theme.colors.border
    : "transparent";
  const borderWidth = isOutlined ? 1 : 0;

  // Header
  const hasHeader = Boolean(title || subtitle || icon || badge || headerRight);

  const renderHeader = () => {
    if (!hasHeader) return null;
    return (
      <View style={styles.headerRow}>
        <View style={styles.headerLeftWrap}>
          {icon ? <View style={styles.iconContainer}>{icon}</View> : null}
          <View style={styles.titleColumn}>
            <View style={styles.titleBadgeRow}>
              {title ? (
                <Text
                  style={[
                    styles.title,
                    {
                      color: theme.colors.cardForeground,
                      fontFamily: theme.fontFamily.bold,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {title}
                </Text>
              ) : null}
              {badge ? (
                typeof badge === "string" ? (
                  <View
                    style={[
                      styles.badgeWrap,
                      {
                        backgroundColor: isDark
                          ? "rgba(107, 99, 255, 0.2)"
                          : "rgba(79, 70, 255, 0.1)",
                      },
                    ]}
                  >
                    <Text style={[styles.badgeText, { color: theme.colors.primary }]}>
                      {badge}
                    </Text>
                  </View>
                ) : (
                  badge
                )
              ) : null}
            </View>
            {subtitle ? (
              <Text
                style={[
                  styles.subtitle,
                  {
                    color: theme.colors.mutedForeground,
                    fontFamily: theme.fontFamily.regular,
                  },
                ]}
                numberOfLines={2}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        {headerRight ? (
          <View style={styles.headerRightWrap}>{headerRight}</View>
        ) : null}
      </View>
    );
  };

  // Loading state
  const renderLoadingSkeleton = () => {
    if (loadingSkeleton) return loadingSkeleton;
    return (
      <View style={styles.loadingWrap}>
        {title ? (
          <View style={styles.skeletonHeader}>
            <Skeleton width="55%" height={20} borderRadius={6} />
            <Skeleton width="35%" height={14} borderRadius={4} />
          </View>
        ) : null}
        <View style={styles.skeletonBody}>
          {Array.from({ length: skeletonLines }).map((_, idx) => (
            <Skeleton
              key={`skel-${idx}`}
              width={idx === 0 ? "100%" : idx === skeletonLines - 1 ? "70%" : "88%"}
              height={16}
              borderRadius={6}
            />
          ))}
        </View>
      </View>
    );
  };

  // Empty state
  const renderEmptyState = () => {
    if (emptyNode) return emptyNode;
    return (
      <EmptyState
        illustration={emptyIllustration ?? "general"}
        compact
        title={emptyTitle ?? "No Data Available"}
        description={emptyDescription}
        primaryAction={emptyAction}
        secondaryAction={emptySecondaryAction}
        tip={emptyTip}
      />
    );
  };

  const cardInner = (
    <View style={[styles.innerContent, contentStyle]}>
      {renderHeader()}
      {loading
        ? renderLoadingSkeleton()
        : empty
          ? renderEmptyState()
          : children}
      {footer ? (
        <View
          style={[
            styles.footerWrap,
            { borderTopColor: theme.colors.border },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );

  const containerStyle: StyleProp<ViewStyle> = [
    styles.card,
    {
      backgroundColor,
      borderColor,
      borderWidth,
      borderRadius: resolvedRadius,
      opacity: disabled ? 0.6 : 1,
    },
    elevationStyle,
    style,
  ];

  if (isInteractive) {
    return (
      <Animated.View style={[animatedScaleStyle, styles.animatedWrapper]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          testID={testID}
          onPress={handlePress}
          onLongPress={handleLongPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          android_ripple={{
            color: isDark
              ? "rgba(255, 255, 255, 0.08)"
              : "rgba(79, 70, 255, 0.12)",
            borderless: false,
            foreground: true,
          }}
          style={({ pressed }) => [
            containerStyle,
            Platform.OS === "ios" && pressed && { opacity: 0.88 },
          ]}
        >
          {cardInner}
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <View testID={testID} style={containerStyle}>
      {cardInner}
    </View>
  );
}

const styles = StyleSheet.create({
  animatedWrapper: {
    width: "100%",
  },
  card: {
    width: "100%",
    overflow: "hidden",
  },
  innerContent: {
    width: "100%",
    padding: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerLeftWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  titleColumn: {
    flex: 1,
    gap: 2,
  },
  titleBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  title: {
    fontSize: 17,
    letterSpacing: -0.2,
  },
  badgeWrap: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  headerRightWrap: {
    marginLeft: 8,
    alignItems: "flex-end",
  },
  footerWrap: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  loadingWrap: {
    paddingVertical: 8,
    gap: 12,
  },
  skeletonHeader: {
    gap: 6,
    marginBottom: 4,
  },
  skeletonBody: {
    gap: 8,
  },
});
