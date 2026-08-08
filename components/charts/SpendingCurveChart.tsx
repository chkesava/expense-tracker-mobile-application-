import React, { useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop, Line, Text as SvgText } from "react-native-svg";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  FadeOut,
} from "react-native-reanimated";

import { Amount } from "@/components/common/Amount";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface CurvePoint {
  date: string; // e.g. "2026-08-01" or "1", "2"...
  amount: number;
}

export interface SpendingCurveChartProps {
  points: CurvePoint[];
  height?: number;
  currency?: string;
  lineColor?: string;
  showCumulative?: boolean;
}

export function SpendingCurveChart({
  points,
  height = 160,
  currency = "USD",
  lineColor,
  showCumulative = false,
}: SpendingCurveChartProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const [containerWidth, setContainerWidth] = useState(300);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const activeLineColor = lineColor || theme.colors.primary;

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 50) setContainerWidth(w);
  };

  const processedData = useMemo(() => {
    if (!showCumulative) return points;
    let running = 0;
    return points.map((p) => {
      running += p.amount;
      return { date: p.date, amount: running };
    });
  }, [points, showCumulative]);

  const maxAmount = useMemo(() => {
    const max = Math.max(...processedData.map((p) => p.amount), 0);
    return max > 0 ? max * 1.15 : 100;
  }, [processedData]);

  const chartPaddingTop = 20;
  const chartPaddingBottom = 26;
  const chartPaddingHorizontal = 16;
  const chartWidth = containerWidth - chartPaddingHorizontal * 2;
  const chartHeight = height - chartPaddingTop - chartPaddingBottom;

  const coordinates = useMemo(() => {
    if (processedData.length === 0) return [];
    const n = processedData.length;
    const stepX = n > 1 ? chartWidth / (n - 1) : 0;

    return processedData.map((p, i) => {
      const x = chartPaddingHorizontal + i * stepX;
      const y = chartPaddingTop + chartHeight - (p.amount / maxAmount) * chartHeight;
      return { x, y, ...p, index: i };
    });
  }, [processedData, chartWidth, chartHeight, maxAmount, chartPaddingHorizontal, chartPaddingTop]);

  // Generate smooth SVG path (catmull-rom or simple bezier)
  const { linePath, areaPath } = useMemo(() => {
    if (coordinates.length < 2) return { linePath: "", areaPath: "" };

    let d = `M ${coordinates[0].x} ${coordinates[0].y}`;

    for (let i = 0; i < coordinates.length - 1; i++) {
      const p0 = coordinates[i === 0 ? i : i - 1];
      const p1 = coordinates[i];
      const p2 = coordinates[i + 1];
      const p3 = coordinates[i + 2 < coordinates.length ? i + 2 : i + 1];

      // Catmull-Rom to Cubic Bezier conversion
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    const baselineY = chartPaddingTop + chartHeight;
    const firstX = coordinates[0].x;
    const lastX = coordinates[coordinates.length - 1].x;
    const area = `${d} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;

    return { linePath: d, areaPath: area };
  }, [coordinates, chartPaddingTop, chartHeight]);

  const selectedPoint = selectedIndex !== null ? coordinates[selectedIndex] : null;

  if (processedData.length === 0) {
    return (
      <View style={[styles.emptyContainer, { height }]}>
        <Text style={{ color: theme.colors.mutedForeground }}>No spending points available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {/* Selected Point Badge with Reanimated Fade */}
      {selectedPoint && (
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
          <Text style={[styles.tooltipDate, { color: theme.colors.mutedForeground }]}>
            {selectedPoint.date}:
          </Text>
          <Amount
            value={selectedPoint.amount}
            currency={currency}
            style={{ fontSize: 13, fontWeight: "800", color: activeLineColor }}
          />
        </Animated.View>
      )}

      {/* SVG Canvas with Animated Container */}
      <Animated.View entering={FadeIn.duration(250)}>
        <Svg width={containerWidth} height={height}>
          <Defs>
            <LinearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={activeLineColor} stopOpacity={isDark ? 0.35 : 0.25} />
              <Stop offset="100%" stopColor={activeLineColor} stopOpacity={0.0} />
            </LinearGradient>
          </Defs>

          {/* Grid lines */}
          {[0, 0.5, 1].map((ratio, i) => {
            const y = chartPaddingTop + chartHeight * (1 - ratio);
            return (
              <Line
                key={i}
                x1={chartPaddingHorizontal}
                y1={y}
                x2={containerWidth - chartPaddingHorizontal}
                y2={y}
                stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}
                strokeDasharray="4 4"
                strokeWidth={1}
              />
            );
          })}

          {/* Shaded Area Fill */}
          {areaPath ? <Path d={areaPath} fill="url(#curveGradient)" /> : null}

          {/* Smooth Line */}
          {linePath ? (
            <Path
              d={linePath}
              stroke={activeLineColor}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ) : null}

          {/* Interactive Data Dots */}
          {coordinates.map((pt, i) => {
            const isSelected = selectedIndex === i;
            const isKeyPoint =
              isSelected ||
              i === 0 ||
              i === coordinates.length - 1 ||
              pt.amount === Math.max(...processedData.map((d) => d.amount));

            return (
              <Circle
                key={i}
                cx={pt.x}
                cy={pt.y}
                r={isSelected ? 6 : isKeyPoint ? 3.5 : 2}
                fill={isSelected ? theme.colors.foreground : activeLineColor}
                stroke={theme.colors.card}
                strokeWidth={isSelected ? 2 : 1}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => undefined);
                  setSelectedIndex(i);
                }}
              />
            );
          })}

          {/* Date labels at bottom */}
          {coordinates.length > 0 && (
            <>
              <SvgText
                x={coordinates[0].x}
                y={height - 8}
                fontSize={10}
                fill={theme.colors.mutedForeground}
                textAnchor="start"
              >
                {coordinates[0].date}
              </SvgText>
              {coordinates.length > 2 && (
                <SvgText
                  x={coordinates[Math.floor(coordinates.length / 2)].x}
                  y={height - 8}
                  fontSize={10}
                  fill={theme.colors.mutedForeground}
                  textAnchor="middle"
                >
                  {coordinates[Math.floor(coordinates.length / 2)].date}
                </SvgText>
              )}
              <SvgText
                x={coordinates[coordinates.length - 1].x}
                y={height - 8}
                fontSize={10}
                fill={theme.colors.mutedForeground}
                textAnchor="end"
              >
                {coordinates[coordinates.length - 1].date}
              </SvgText>
            </>
          )}
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    gap: 6,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  tooltipBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: "center",
  },
  tooltipDate: {
    fontSize: 11,
    fontWeight: "600",
  },
});

