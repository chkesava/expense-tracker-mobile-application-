import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface DistributionSegment {
  label: string;
  value: number;
  color: string;
}

export interface DistributionBarProps {
  segments: DistributionSegment[];
  height?: number;
  showLegend?: boolean;
}

export function DistributionBar({
  segments,
  height = 12,
  showLegend = true,
}: DistributionBarProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const validSegments = useMemo(
    () => segments.filter((s) => s.value > 0),
    [segments]
  );
  const total = useMemo(
    () => validSegments.reduce((sum, s) => sum + s.value, 0),
    [validSegments]
  );

  if (validSegments.length === 0 || total === 0) {
    return (
      <View
        style={[
          styles.emptyBar,
          {
            height,
            backgroundColor: isDark
              ? "rgba(255,255,255,0.06)"
              : "rgba(0,0,0,0.05)",
          },
        ]}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Stacked Horizontal Bar */}
      <View style={[styles.barTrack, { height }]}>
        {validSegments.map((segment, idx) => {
          const flex = segment.value / total;
          const isFirst = idx === 0;
          const isLast = idx === validSegments.length - 1;

          return (
            <View
              key={segment.label + idx}
              style={[
                styles.segment,
                {
                  flex,
                  backgroundColor: segment.color,
                  borderTopLeftRadius: isFirst ? height / 2 : 0,
                  borderBottomLeftRadius: isFirst ? height / 2 : 0,
                  borderTopRightRadius: isLast ? height / 2 : 0,
                  borderBottomRightRadius: isLast ? height / 2 : 0,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Legend Row */}
      {showLegend && (
        <View style={styles.legendRow}>
          {validSegments.map((segment, idx) => {
            const percent = Math.round((segment.value / total) * 100);
            return (
              <View key={segment.label + idx} style={styles.legendItem}>
                <View
                  style={[styles.colorDot, { backgroundColor: segment.color }]}
                />
                <Text
                  style={[
                    styles.legendText,
                    { color: theme.colors.mutedForeground },
                  ]}
                  numberOfLines={1}
                >
                  {segment.label} ({percent}%)
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    gap: 8,
  },
  barTrack: {
    width: "100%",
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: 999,
  },
  segment: {
    height: "100%",
  },
  emptyBar: {
    width: "100%",
    borderRadius: 999,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: "600",
  },
});
