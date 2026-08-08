import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withSpring,
  ZoomIn,
} from "react-native-reanimated";

import { Amount } from "@/components/common/Amount";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface DonutSegment {
  id?: string;
  label: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  data: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  currency?: string;
  title?: string;
  showLegend?: boolean;
}

function AnimatedDonutSlice({
  cx,
  cy,
  radius,
  strokeWidth,
  color,
  rotation,
  sliceLength,
  circumference,
  isSelected,
  index,
  onPress,
}: {
  cx: number;
  cy: number;
  radius: number;
  strokeWidth: number;
  color: string;
  rotation: number;
  sliceLength: number;
  circumference: number;
  isSelected: boolean;
  index: number;
  onPress: () => void;
}) {
  const progress = useSharedValue(0);
  const animRadius = useSharedValue(radius);
  const animStroke = useSharedValue(strokeWidth);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      index * 50,
      withSpring(1, { damping: 18, stiffness: 160, mass: 0.8 })
    );
  }, [sliceLength, index, progress]);

  useEffect(() => {
    animRadius.value = withSpring(isSelected ? radius + 2 : radius, {
      damping: 15,
      stiffness: 200,
    });
    animStroke.value = withSpring(isSelected ? strokeWidth + 4 : strokeWidth, {
      damping: 15,
      stiffness: 200,
    });
  }, [isSelected, radius, strokeWidth, animRadius, animStroke]);

  const animatedProps = useAnimatedProps(() => {
    const currentLength = sliceLength * progress.value;
    const gap = Math.max(0, circumference - currentLength);
    return {
      r: animRadius.value,
      strokeWidth: animStroke.value,
      strokeDasharray: `${currentLength} ${gap}`,
    };
  });

  return (
    <AnimatedCircle
      cx={cx}
      cy={cy}
      r={radius}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      transform={`rotate(${rotation} ${cx} ${cy})`}
      animatedProps={animatedProps}
      onPress={onPress}
    />
  );
}

export function DonutChart({
  data,
  size = 200,
  strokeWidth = 26,
  currency = "USD",
  title = "Total Spent",
  showLegend = true,
}: DonutChartProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const validData = useMemo(() => data.filter((d) => d.value > 0), [data]);
  const total = useMemo(() => validData.reduce((sum, d) => sum + d.value, 0), [validData]);

  const center = size / 2;
  const radius = center - strokeWidth / 2 - 4;
  const circumference = 2 * Math.PI * radius;

  const slices = useMemo(() => {
    if (total === 0) return [];
    let cumulativeOffset = 0;

    return validData.map((item, idx) => {
      const percentage = item.value / total;
      const sliceLength = percentage * circumference;
      const rotation = cumulativeOffset * 360 - 90; // Start at 12 o'clock
      cumulativeOffset += percentage;

      const isSelected = selectedIndex === idx;

      return {
        ...item,
        percentage: Math.round(percentage * 100),
        sliceLength,
        rotation,
        isSelected,
      };
    });
  }, [validData, total, circumference, selectedIndex]);

  const activeItem = selectedIndex !== null ? validData[selectedIndex] : null;

  const handleSelect = (idx: number) => {
    Haptics.selectionAsync().catch(() => undefined);
    setSelectedIndex((prev) => (prev === idx ? null : idx));
  };

  if (validData.length === 0 || total === 0) {
    return (
      <View style={[styles.emptyContainer, { height: size }]}>
        <Svg width={size} height={size}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}
            strokeWidth={strokeWidth}
            fill="none"
          />
        </Svg>
        <View style={styles.centerOverlay}>
          <Text style={[styles.emptyLabel, { color: theme.colors.mutedForeground }]}>
            No Data
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View
        entering={ZoomIn.springify().damping(18)}
        style={{ width: size, height: size, alignSelf: "center" }}
      >
        <Svg width={size} height={size}>
          {/* Background track */}
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Segment Arcs */}
          <G>
            {slices.map((slice, idx) => (
              <AnimatedDonutSlice
                key={slice.label + idx}
                cx={center}
                cy={center}
                radius={radius}
                strokeWidth={strokeWidth}
                color={slice.color}
                rotation={slice.rotation}
                sliceLength={slice.sliceLength}
                circumference={circumference}
                isSelected={slice.isSelected}
                index={idx}
                onPress={() => handleSelect(idx)}
              />
            ))}
          </G>
        </Svg>

        {/* Center Metric */}
        <Pressable
          style={styles.centerOverlay}
          onPress={() => setSelectedIndex(null)}
        >
          <Text
            style={[
              styles.centerSub,
              { color: theme.colors.mutedForeground, fontSize: theme.typography.xs },
            ]}
            numberOfLines={1}
          >
            {activeItem ? activeItem.label : title}
          </Text>
          <Amount
            value={activeItem ? activeItem.value : total}
            currency={currency}
            animated
            ghostable
            style={{
              fontSize: activeItem ? 18 : 20,
              fontWeight: "900",
              color: theme.colors.foreground,
            }}
          />
          {activeItem && (
            <Text
              style={[
                styles.centerPercent,
                { color: activeItem.color, fontSize: 11, fontWeight: "700" },
              ]}
            >
              {Math.round((activeItem.value / total) * 100)}% of total
            </Text>
          )}
        </Pressable>
      </Animated.View>

      {/* Interactive Legend Grid */}
      {showLegend && (
        <Animated.View entering={FadeIn.delay(100)} style={styles.legendContainer}>
          {validData.map((item, idx) => {
            const isSelected = selectedIndex === idx;
            const percent = Math.round((item.value / total) * 100);
            return (
              <Pressable
                key={item.label + idx}
                onPress={() => handleSelect(idx)}
                style={({ pressed }) => [
                  styles.legendItem,
                  {
                    backgroundColor: isSelected
                      ? isDark
                        ? "rgba(255,255,255,0.1)"
                        : "rgba(0,0,0,0.06)"
                      : isDark
                      ? "rgba(255,255,255,0.03)"
                      : "rgba(0,0,0,0.02)",
                    borderColor: isSelected ? item.color : theme.colors.border,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <View style={[styles.colorDot, { backgroundColor: item.color }]} />
                <View style={styles.legendDetails}>
                  <Text
                    style={[
                      styles.legendLabel,
                      {
                        color: isSelected ? item.color : theme.colors.foreground,
                        fontSize: theme.typography.xs,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  <Text
                    style={[
                      styles.legendPercent,
                      { color: theme.colors.mutedForeground, fontSize: 10 },
                    ]}
                  >
                    {percent}%
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  centerOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  centerSub: {
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
    textAlign: "center",
  },
  centerPercent: {
    marginTop: 2,
  },
  emptyLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  legendContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    maxWidth: "48%",
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  legendLabel: {
    fontWeight: "600",
    flexShrink: 1,
  },
  legendPercent: {
    fontWeight: "700",
  },
});
