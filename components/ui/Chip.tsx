import React, { type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { haptic as hapticFeedback } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";

export type ChipTone = "primary" | "success" | "destructive";
export type ChipSize = "sm" | "md";
/**
 * `solid` fills the selected chip with its tone (filters, pickers);
 * `outline` keeps the neutral fill and only tints the border and label
 * (tab-like rows where several chips sit side by side).
 */
export type ChipAppearance = "solid" | "outline";

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: ChipTone;
  /** Overrides the tone colour, for hubs with their own identity accent. */
  accentColor?: string;
  appearance?: ChipAppearance;
  size?: ChipSize;
  /** Receives the colour the label is drawn in, so icons track selection. */
  icon?: (color: string) => ReactNode;
  trailing?: (color: string) => ReactNode;
  disabled?: boolean;
  haptic?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "tab" | "radio";
  onLayout?: (event: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Canonical Spendly chip (SPENDLY-152). Replaces the per-screen
 * `Pressable` + rgba fill chips in the dashboard, add-transaction form and
 * journal filters.
 */
export function Chip({
  label,
  selected = false,
  onPress,
  tone = "primary",
  accentColor,
  appearance = "solid",
  size = "md",
  icon,
  trailing,
  disabled = false,
  haptic = true,
  accessibilityLabel,
  accessibilityRole = "button",
  onLayout,
  style,
  testID,
}: ChipProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const c = theme.colors;

  const toneColor =
    accentColor ??
    (tone === "success" ? c.success : tone === "destructive" ? c.destructive : c.primary);
  const toneForeground =
    tone === "success"
      ? c.successForeground
      : tone === "destructive"
        ? c.destructiveForeground
        : c.primaryForeground;

  const solid = selected && appearance === "solid";
  const background = solid ? toneColor : surfaces.control;
  const border = selected ? toneColor : c.border;
  const foreground = solid ? toneForeground : selected ? toneColor : c.foreground;

  return (
    <Pressable
      testID={testID}
      onLayout={onLayout}
      disabled={disabled || !onPress}
      onPress={() => {
        if (haptic) void hapticFeedback.selection();
        onPress?.();
      }}
      hitSlop={size === "sm" ? 6 : 4}
      style={({ pressed }) => [
        styles.base,
        size === "sm" ? styles.sm : styles.md,
        {
          backgroundColor: background,
          borderColor: border,
          borderWidth: selected && appearance === "outline" ? 1.5 : 1,
          opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
        },
        style,
      ]}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {icon?.(foreground)}
      <Text
        style={[
          size === "sm" ? styles.labelSm : styles.labelMd,
          { color: foreground, fontWeight: selected ? "700" : "600" },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {trailing?.(foreground)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 999,
    borderCurve: "continuous",
  },
  sm: {
    minHeight: 30,
    paddingHorizontal: 12,
  },
  md: {
    minHeight: 36,
    paddingHorizontal: 14,
  },
  labelSm: {
    fontSize: 12,
  },
  labelMd: {
    fontSize: 13,
  },
});
