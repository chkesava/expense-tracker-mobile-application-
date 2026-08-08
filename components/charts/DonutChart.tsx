import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { G, Path } from "react-native-svg";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  ZoomIn,
} from "react-native-reanimated";

import { Amount } from "@/components/common/Amount";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

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

  const arcs = useMemo(() => {
    if (total === 0) return [];
    let currentAngle = -Math.PI / 2; // start from top (12 o'clock)

    return validData.map((item, idx) => {
      const percentage = item.value / total;
      const angleSpan = percentage * 2 * Math.PI;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angleSpan;
      currentAngle = endAngle;

      const isSelected = selectedIndex === idx;
      const currentRadius = isSelected ? radius + 2 : radius;
      const currentStroke = isSelected ? strokeWidth + 4 : strokeWidth;

      // Calculate path arc
      const x1 = center + currentRadius * Math.cos(startAngle);
      const y1 = center + currentRadius * Math.sin(startAngle);
      const x2 = center + currentRadius * Math.cos(endAngle - 0.001); // avoid exact 2pi wrap glitch
      const y2 = center + currentRadius * Math.sin(endAngle - 0.001);

      const largeArcFlag = angleSpan > Math.PI ? 1 : 0;
      const d = `M ${x1} ${y1} A ${currentRadius} ${currentRadius} 0 ${largeArcFlag} 1 ${x2} ${y2}`;

      return {
        ...item,
        percentage: Math.round(percentage * 100),
        d,
        strokeWidth: currentStroke,
        isSelected,
      };
    });
  }, [validData, total, radius, strokeWidth, center, selectedIndex]);

  const activeItem = selectedIndex !== null ? validData[selectedIndex] : null;

  const handleSelect = (idx: number) => {
    Haptics.selectionAsync().catch(() => undefined);
    setSelectedIndex((prev) => (prev === idx ? null : idx));
  };

  if (validData.length === 0 || total === 0) {
    return (
      <View style={[styles.emptyContainer, { height: size }]}>
        <Svg width={size} height={size}>
          <Path
            d={`M ${center + radius} ${center} A ${radius} ${radius} 0 1 1 ${center - radius} ${center} A ${radius} ${radius} 0 1 1 ${center + radius} ${center}`}
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
          <Path
            d={`M ${center + radius} ${center} A ${radius} ${radius} 0 1 1 ${center - radius} ${center} A ${radius} ${radius} 0 1 1 ${center + radius} ${center}`}
            stroke={isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Segment Arcs */}
          <G>
            {arcs.map((arc, idx) => (
              <Path
                key={arc.label + idx}
                d={arc.d}
                stroke={arc.color}
                strokeWidth={arc.strokeWidth}
                strokeLinecap="round"
                fill="none"
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

