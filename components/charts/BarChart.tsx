import React, { useEffect, useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { Amount } from "@/components/common/Amount";
import { compactAxisValue } from "@/components/charts/axis";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";

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

function BarSegment({
  x,
  height,
  baselineY,
  width,
  color,
  opacity,
  onPress,
}: {
  x: number;
  height: number;
  baselineY: number;
  width: number;
  color: string;
  opacity: number;
  onPress: () => void;
}) {
  return (
    <Rect
      x={x}
      y={baselineY - height}
      width={width}
      height={height}
      rx={4}
      fill={color}
      opacity={opacity}
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

  // SPENDLY-489: the bars grow in as one animated view. Animating each SVG
  // rect's geometry with Reanimated pushed synchronous props to native views
  // that were not (or no longer) mounted, and every failure logged a full
  // stack trace on the UI thread.
  const grow = useSharedValue(0);
  const dataKey = useMemo(
    () => data.map((d) => `${d.value}:${d.secondaryValue ?? 0}`).join("|"),
    [data]
  );
  useEffect(() => {
    grow.value = 0;
    grow.value = withSpring(1, { damping: 17, stiffness: 200, mass: 0.8 });
  }, [dataKey, grow]);
  const growStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: grow.value }],
  }));

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
    haptic.selection().catch(() => undefined);
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
      <View style={{ width: containerWidth, height }}>
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

          {/* X-axis labels */}
          {data.map((item, idx) => {
            const isSelected = selectedIndex === idx;
            if (hasSecondary && !(idx % labelStride === 0 || isSelected)) return null;
            const slotCenterX = chartPaddingLeft + idx * slotWidth + slotWidth / 2;
            return (
              <SvgText
                key={idx}
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
            );
          })}
        </Svg>

        {/* Bars: one Svg scaled from the baseline, so the grid and labels never squash. */}
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.barsLayer,
            { width: containerWidth, height: baselineY, transformOrigin: "bottom" },
            growStyle,
          ]}
        >
          <Svg width={containerWidth} height={baselineY}>
            {data.map((item, idx) => {
              const isSelected = selectedIndex === idx;
              const slotCenterX = chartPaddingLeft + idx * slotWidth + slotWidth / 2;
              const h1 = Math.max((item.value / maxValue) * chartHeight, 2);
              const color1 = item.color || defaultPrimaryColor;
              const barOpacity = selectedIndex === null || isSelected ? 1 : 0.4;

              if (hasSecondary) {
                const h2 = Math.max(((item.secondaryValue ?? 0) / maxValue) * chartHeight, 2);
                const color2 = item.secondaryColor || defaultSecondaryColor;
                return (
                  <G key={idx}>
                    <BarSegment
                      x={slotCenterX - barWidth - 1}
                      height={h1}
                      baselineY={baselineY}
                      width={barWidth}
                      color={color1}
                      opacity={barOpacity}
                      onPress={() => handleSelectBar(idx)}
                    />
                    <BarSegment
                      x={slotCenterX + 1}
                      height={h2}
                      baselineY={baselineY}
                      width={barWidth}
                      color={color2}
                      opacity={barOpacity}
                      onPress={() => handleSelectBar(idx)}
                    />
                  </G>
                );
              }

              return (
                <BarSegment
                  key={idx}
                  x={slotCenterX - barWidth / 2}
                  height={h1}
                  baselineY={baselineY}
                  width={barWidth}
                  color={color1}
                  opacity={barOpacity}
                  onPress={() => handleSelectBar(idx)}
                />
              );
            })}
          </Svg>
        </Animated.View>
      </View>

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
  barsLayer: {
    position: "absolute",
    top: 0,
    left: 0,
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

