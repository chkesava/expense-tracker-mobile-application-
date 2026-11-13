import React, { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  /** Receives the icon colour for the option's current state. */
  icon?: (color: string) => ReactNode;
  /** Icon colour while selected; defaults to the theme primary. */
  activeColor?: string;
  accessibilityLabel?: string;
};

export type SegmentedControlProps<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /**
   * Opt-in: a label that doesn't fit takes a second, centred line instead of
   * being cut ("Subscript…" in a phone-width form). Off by default, so every
   * existing control renders as before.
   */
  wrapLabels?: boolean;
};

/**
 * Canonical equal-width segmented switch (SPENDLY-152): a neutral track with
 * the selected segment lifted onto the card surface.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
  testID,
  wrapLabels = false,
}: SegmentedControlProps<T>) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={[
        styles.track,
        { backgroundColor: surfaces.control, borderColor: theme.colors.border },
        style,
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const iconColor = selected
          ? (option.activeColor ?? theme.colors.primary)
          : theme.colors.mutedForeground;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (selected) return;
              void haptic.selection();
              onChange(option.value);
            }}
            style={({ pressed }) => [
              styles.segment,
              wrapLabels && styles.segmentWrap,
              selected && [{ backgroundColor: theme.colors.card }, theme.elevation[1]],
              pressed && !selected && { opacity: 0.7 },
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
          >
            {option.icon?.(iconColor)}
            <Text
              style={[
                styles.label,
                wrapLabels && styles.labelWrap,
                {
                  color: selected ? theme.colors.foreground : theme.colors.mutedForeground,
                  fontWeight: selected ? "700" : "500",
                },
              ]}
              numberOfLines={wrapLabels ? 2 : 1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    padding: 4,
    gap: 4,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 40,
    borderRadius: 10,
    borderCurve: "continuous",
  },
  label: {
    fontSize: 14,
  },
  segmentWrap: {
    minWidth: 0,
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  labelWrap: {
    flexShrink: 1,
    fontSize: 13,
    textAlign: "center",
  },
});
