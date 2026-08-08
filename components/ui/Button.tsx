import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { ReactNode } from "react";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { useTheme } from "@/theme/ThemeProvider";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ButtonVariant =
  | "primary"
  | "filled"
  | "secondary"
  | "outline"
  | "destructive"
  | "ghost"
  | "text"
  | "tonal"
  | "elevated";

export type ButtonSize = "sm" | "md" | "lg" | "icon";

export type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  haptic = true,
  disabled,
  onPress,
  onPressIn,
  onPressOut,
  style,
  ...props
}: ButtonProps) {
  const { theme } = useTheme();
  const isDisabled = disabled || loading;
  const scale = useSharedValue(1);

  const isPrimary = variant === "primary" || variant === "filled";
  const isText = variant === "ghost" || variant === "text";
  const isDestructive = variant === "destructive";
  const isTonal = variant === "tonal";
  const isElevated = variant === "elevated";
  const isOutline = variant === "outline";
  const isSecondary = variant === "secondary";

  const background = isPrimary
    ? theme.colors.primary
    : isDestructive
      ? theme.colors.destructive
      : isSecondary
        ? theme.colors.secondary
        : isTonal
          ? theme.colors.secondaryContainer
          : isElevated
            ? theme.colors.card
            : "transparent";

  const foreground = isPrimary
    ? theme.colors.primaryForeground
    : isDestructive
      ? theme.colors.destructiveForeground
      : isTonal
        ? theme.colors.onSecondaryContainer
        : isText || isOutline
          ? theme.colors.primary
          : theme.colors.foreground;

  const borderColor = isOutline
    ? theme.colors.outline ?? theme.colors.border
    : isSecondary
      ? theme.colors.border
      : "transparent";

  const borderWidth = isOutline || isSecondary ? 1 : 0;

  const paddingVertical =
    size === "sm" ? 8 : size === "lg" ? 14 : size === "icon" ? 8 : 10;
  const paddingHorizontal =
    size === "sm" ? 14 : size === "lg" ? 24 : size === "icon" ? 8 : 18;
  const minHeight = size === "sm" ? 40 : size === "lg" ? 54 : size === "icon" ? 48 : 48;
  const minWidth = size === "icon" ? 48 : undefined;
  const borderRadius = theme.radius.full; // MD3 pill buttons

  const fontSize =
    size === "sm"
      ? theme.typography.xs
      : size === "lg"
        ? theme.typography.md
        : theme.typography.sm;

  const elevationStyle = isElevated ? theme.elevation[1] : undefined;

  const rippleColor = isPrimary || isDestructive
    ? "rgba(255, 255, 255, 0.24)"
    : theme.colors.primary + "22";

  const handlePressIn = (e: GestureResponderEvent) => {
    if (!isDisabled) {
      scale.value = withSpring(0.96, { damping: 14, stiffness: 350 });
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    if (!isDisabled) {
      scale.value = withSpring(1, { damping: 12, stiffness: 300 });
    }
    onPressOut?.(e);
  };

  const handlePress = (e: GestureResponderEvent) => {
    if (isDisabled) return;
    if (haptic) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
    onPress?.(e);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      android_ripple={{
        color: rippleColor,
        borderless: false,
        foreground: true,
      }}
      style={[
        styles.base,
        {
          backgroundColor: background,
          borderColor,
          borderWidth,
          paddingVertical,
          paddingHorizontal,
          minHeight,
          minWidth,
          borderRadius,
          opacity: isDisabled ? 0.45 : 1,
        },
        elevationStyle,
        style,
        animatedStyle,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : typeof children === "string" ? (
        <Text
          style={[
            styles.text,
            {
              color: foreground,
              fontSize,
              fontFamily: theme.fontFamily.semibold,
            },
          ]}
          numberOfLines={1}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    overflow: "hidden",
  },
  text: {
    letterSpacing: 0.2,
  },
});

