import React, { useEffect, useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";

import { Amount } from "@/components/common/Amount";
import { compactAxisValue } from "@/components/charts/axis";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const AnimatedRect = Animated.createAnimatedComponent(Rect);

export interface BarChartItem {
  label: string; // e.g. "Jan", "Feb" or "Food"
  value: number;
  secondaryValue?: number;
  color?: string;
  secondaryColor?: string;
}

export interface BarChartProps {
  data: BarChartItem[];
  height?: number;
  currency?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  primaryColor?: string;
  secondaryColor?: string;
  showLegend?: boolean;
  /** Render a compact value axis (0, 30K, 60K…) down the left edge. */
  showYAxis?: boolean;
}

function AnimatedBarSegment({
  x,
  targetHeight,
  baselineY,
  width,
  color,
  opacity,
  index,
  onPress,
}: {
  x: number;
  targetHeight: number;
  baselineY: number;
  width: number;
  color: string;
  opacity: number;
  index: number;
  onPress: () => void;
}) {
  const animatedHeight = useSharedValue(0);

  useEffect(() => {
    animatedHeight.value = withDelay(
      index * 30,
      withSpring(targetHeight, { damping: 17, stiffness: 200, mass: 0.8 })
    );
  }, [targetHeight, index, animatedHeight]);

  const animatedProps = useAnimatedProps(() => {
    const currentHeight = Math.max(animatedHeight.value, 2);
    const currentY = baselineY - currentHeight;
    return {
      height: currentHeight,
      y: currentY,
    };
  });

  return (
    <AnimatedRect
      x={x}
      width={width}
      rx={4}
      fill={color}
      opacity={opacity}
      animatedProps={animatedProps}
      onPress={onPress}
    />
  );
}

export function BarChart({
  data,
  height = 180,
  currency = "USD",
  primaryLabel = "Expense",
  secondaryLabel = "Income",
  primaryColor,
  secondaryColor,
  showLegend = true,
  showYAxis = false,
}: BarChartProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const [containerWidth, setContainerWidth] = useState(300);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const defaultPrimaryColor = primaryColor || theme.colors.primary;
  const defaultSecondaryColor = secondaryColor || theme.colors.success;

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 50) setContainerWidth(w);
  };

  const hasSecondary = useMemo(
    () => data.some((d) => (d.secondaryValue ?? 0) > 0),
    [data]
  );

  const maxValue = useMemo(() => {
    let max = 0;
    data.forEach((d) => {
      if (d.value > max) max = d.value;
      if ((d.secondaryValue ?? 0) > max) max = d.secondaryValue ?? 0;
    });
    return max > 0 ? max * 1.15 : 100; // 15% headroom
  }, [data]);

  const chartPaddingTop = 20;
  const chartPaddingBottom = 26;
  const chartPaddingLeft = showYAxis ? 34 : 0;
  const chartHeight = height - chartPaddingTop - chartPaddingBottom;
  const baselineY = chartPaddingTop + chartHeight;
  const plotWidth = Math.max(containerWidth - chartPaddingLeft, 1);
  const gridRatios = showYAxis ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.5, 1];

  const handleSelectBar = (idx: number) => {
    Haptics.selectionAsync().catch(() => undefined);
    setSelectedIndex((prev) => (prev === idx ? null : idx));
  };

  const selectedItem = selectedIndex !== null ? data[selectedIndex] : null;

  if (data.length === 0) {
    return (
      <View style={[styles.emptyContainer, { height }]}>
        <Text style={{ color: theme.colors.mutedForeground }}>No chart data available</Text>
      </View>
    );
  }

  const slotWidth = plotWidth / data.length;
  const barWidth = hasSecondary ? Math.min(slotWidth * 0.35, 14) : Math.min(slotWidth * 0.55, 24);
  // Narrow slots can't fit a label per bar, so label every other slot instead
  // of letting them collide.
  const labelStride = slotWidth < 26 ? 2 : 1;

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {/* Selected Item Tooltip Header with Reanimated Fade */}
      {selectedItem && (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          style={[
            styles.tooltipBadge,
            {
              backgroundColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.05)",
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.tooltipLabel, { color: theme.colors.foreground }]}>
            {selectedItem.label}:
          </Text>
          <View style={styles.tooltipAmounts}>
            <Text style={{ color: primaryColor || theme.colors.primary, fontSize: 12, fontWeight: "700" }}>
              {primaryLabel}: <Amount value={selectedItem.value} currency={currency} />
            </Text>
            {hasSecondary && selectedItem.secondaryValue !== undefined && (
              <Text style={{ color: secondaryColor || theme.colors.success, fontSize: 12, fontWeight: "700" }}>
                {secondaryLabel}: <Amount value={selectedItem.secondaryValue} currency={currency} />
              </Text>
            )}
          </View>
        </Animated.View>
      )}

      {/* SVG Canvas */}
      <Svg width={containerWidth} height={height}>
        {/* Horizontal grid lines (with optional compact value axis) */}
        {gridRatios.map((ratio, i) => {
          const y = chartPaddingTop + chartHeight * (1 - ratio);
          return (
            <G key={i}>
              <Line
                x1={chartPaddingLeft}
                y1={y}
                x2={containerWidth}
                y2={y}
                stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}
                strokeDasharray="4 4"
                strokeWidth={1}
              />
              {showYAxis ? (
                <SvgText
                  x={chartPaddingLeft - 6}
                  y={y + 3.5}
                  fontSize={9}
                  fill={theme.colors.mutedForeground}
                  textAnchor="end"
                >
                  {compactAxisValue(maxValue * ratio)}
                </SvgText>
              ) : null}
            </G>
          );
        })}

        {/* Bars */}
        <G>
          {data.map((item, idx) => {
            const isSelected = selectedIndex === idx;
            const slotCenterX = chartPaddingLeft + idx * slotWidth + slotWidth / 2;

            const h1 = Math.max((item.value / maxValue) * chartHeight, 2);
            const color1 = item.color || defaultPrimaryColor;
            const barOpacity = selectedIndex === null || isSelected ? 1 : 0.4;

            if (hasSecondary) {
              const h2 = Math.max(((item.secondaryValue ?? 0) / maxValue) * chartHeight, 2);
              const color2 = item.secondaryColor || defaultSecondaryColor;

              const x1 = slotCenterX - barWidth - 1;
              const x2 = slotCenterX + 1;

              return (
                <G key={idx}>
                  {/* Primary Bar */}
                  <AnimatedBarSegment
                    x={x1}
                    targetHeight={h1}
                    baselineY={baselineY}
                    width={barWidth}
                    color={color1}
                    opacity={barOpacity}
                    index={idx}
                    onPress={() => handleSelectBar(idx)}
                  />
                  {/* Secondary Bar */}
                  <AnimatedBarSegment
                    x={x2}
                    targetHeight={h2}
                    baselineY={baselineY}
                    width={barWidth}
                    color={color2}
                    opacity={barOpacity}
                    index={idx}
                    onPress={() => handleSelectBar(idx)}
                  />
                  {/* X-axis Label */}
                  {idx % labelStride === 0 || isSelected ? (
                    <SvgText
                      x={slotCenterX}
                      y={height - 8}
                      fontSize={10}
                      fontWeight={isSelected ? "800" : "500"}
                      fill={isSelected ? theme.colors.foreground : theme.colors.mutedForeground}
                      textAnchor="middle"
                      onPress={() => handleSelectBar(idx)}
                    >
                      {item.label}
                    </SvgText>
                  ) : null}
                </G>
              );
            }

            const x = slotCenterX - barWidth / 2;
            return (
              <G key={idx}>
                <AnimatedBarSegment
                  x={x}
                  targetHeight={h1}
                  baselineY={baselineY}
                  width={barWidth}
                  color={color1}
                  opacity={barOpacity}
                  index={idx}
                  onPress={() => handleSelectBar(idx)}
                />
                {/* X-axis Label */}
                <SvgText
                  x={slotCenterX}
                  y={height - 8}
                  fontSize={10}
                  fontWeight={isSelected ? "800" : "500"}
                  fill={isSelected ? theme.colors.foreground : theme.colors.mutedForeground}
                  textAnchor="middle"
                  onPress={() => handleSelectBar(idx)}
                >
                  {item.label}
                </SvgText>
              </G>
            );
          })}
        </G>
      </Svg>

      {/* Legend */}
      {showLegend && hasSecondary && (
        <View style={styles.legendRow}>
          <View style={styles.legendIndicator}>
            <View style={[styles.legendDot, { backgroundColor: defaultPrimaryColor }]} />
            <Text style={[styles.legendText, { color: theme.colors.mutedForeground }]}>
              {primaryLabel}
            </Text>
          </View>
          <View style={styles.legendIndicator}>
            <View style={[styles.legendDot, { backgroundColor: defaultSecondaryColor }]} />
            <Text style={[styles.legendText, { color: theme.colors.mutedForeground }]}>
              {secondaryLabel}
            </Text>
          </View>
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
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  tooltipBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: "center",
  },
  tooltipLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  tooltipAmounts: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginTop: 4,
  },
  legendIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: "600",
  },
});

