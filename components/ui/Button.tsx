import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { ReactNode } from "react";

import { useTheme } from "@/theme/ThemeProvider";

type ButtonVariant = "primary" | "secondary" | "outline" | "destructive" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const { theme } = useTheme();
  const isDisabled = disabled || loading;

  const background =
    variant === "primary"
      ? theme.colors.primary
      : variant === "destructive"
        ? theme.colors.destructive
        : variant === "secondary"
          ? theme.colors.secondary
          : "transparent";

  const foreground =
    variant === "primary"
      ? theme.colors.primaryForeground
      : variant === "destructive"
        ? theme.colors.destructiveForeground
        : theme.colors.foreground;

  const borderColor =
    variant === "outline" || variant === "secondary"
      ? theme.colors.border
      : "transparent";

  const paddingVertical = size === "sm" ? 8 : size === "lg" ? 14 : 12;
  const paddingHorizontal = size === "sm" ? 12 : size === "lg" ? 20 : 16;
  const fontSize =
    size === "sm"
      ? theme.typography.xs
      : size === "lg"
        ? theme.typography.md
        : theme.typography.sm;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: background,
          borderColor,
          borderWidth: variant === "outline" || variant === "secondary" ? 1 : 0,
          paddingVertical,
          paddingHorizontal,
          borderRadius: theme.radius.md,
          opacity: isDisabled ? 0.5 : pressed ? 0.92 : 1,
        },
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : typeof children === "string" ? (
        <Text style={{ color: foreground, fontSize, fontWeight: "700" }}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
  },
});
