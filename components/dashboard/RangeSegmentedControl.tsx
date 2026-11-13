import { Pressable, StyleSheet, Text, View } from "react-native";

import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces, withAlpha } from "@/theme/surfaces";

/**
 * A theme-aware pill-group segmented control, extracted from the desktop Net
 * Worth card's inline 1W/1M/3M/6M/1Y control (SPENDLY-718) so other dashboard
 * widgets with a short, fixed set of range options can reuse the same look.
 */
export function RangeSegmentedControl<P extends string>({
  periods,
  value,
  onChange,
  labels,
  accessibilityLabel = "Range",
  testIDPrefix,
}: {
  periods: readonly P[];
  value: P;
  onChange: (period: P) => void;
  labels: Record<P, string>;
  accessibilityLabel?: string;
  testIDPrefix?: string;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  return (
    <View
      style={[
        styles.segments,
        {
          backgroundColor: surfaces.isDark ? withAlpha("#000000", 0.22) : withAlpha(theme.colors.foreground, 0.05),
          borderColor: withAlpha(theme.colors.foreground, 0.1),
        },
      ]}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {periods.map((period) => {
        const selected = period === value;
        return (
          <Pressable
            key={period}
            onPress={() => {
              void haptic.selection();
              onChange(period);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            // Web reads only aria-checked; accessibilityState covers native.
            aria-checked={selected}
            accessibilityLabel={labels[period]}
            testID={testIDPrefix ? `${testIDPrefix}-${period}` : undefined}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
              styles.segment,
              selected
                ? { backgroundColor: theme.colors.primary }
                : (pressed || hovered) && { backgroundColor: withAlpha(theme.colors.foreground, 0.06) },
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                {
                  color: selected ? theme.colors.primaryForeground : theme.colors.mutedForeground,
                  fontFamily: selected ? theme.fontFamily.semibold : theme.fontFamily.medium,
                },
              ]}
            >
              {period}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segments: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    padding: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segment: {
    minWidth: 40,
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentText: {
    fontSize: 13,
  },
});
