import React, { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";

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

function AnimatedSegment({
  flex,
  color,
  isFirst,
  isLast,
  height,
  index,
}: {
  flex: number;
  color: string;
  isFirst: boolean;
  isLast: boolean;
  height: number;
  index: number;
}) {
  const scale = useSharedValue(0);

  useEffect(() => {
    scale.value = 0;
    scale.value = withDelay(
      index * 40,
      withSpring(1, { damping: 16, stiffness: 220 })
    );
  }, [scale, index, flex]);

  const animatedStyle = useAnimatedStyle(() => ({
    flex: flex * scale.value,
  }));

  return (
    <Animated.View
      style={[
        styles.segment,
        {
          backgroundColor: color,
          borderTopLeftRadius: isFirst ? height / 2 : 0,
          borderBottomLeftRadius: isFirst ? height / 2 : 0,
          borderTopRightRadius: isLast ? height / 2 : 0,
          borderBottomRightRadius: isLast ? height / 2 : 0,
        },
        animatedStyle,
      ]}
    />
  );
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
            <AnimatedSegment
              key={segment.label + idx}
              flex={flex}
              color={segment.color}
              isFirst={isFirst}
              isLast={isLast}
              height={height}
              index={idx}
            />
          );
        })}
      </View>

      {/* Legend Row with Staggered Entrance */}
      {showLegend && (
        <View style={styles.legendRow}>
          {validSegments.map((segment, idx) => {
            const percent = Math.round((segment.value / total) * 100);
            return (
              <Animated.View
                key={segment.label + idx}
                entering={FadeInRight.delay(idx * 30).springify()}
                style={styles.legendItem}
              >
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
              </Animated.View>
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

