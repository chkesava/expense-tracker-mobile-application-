import React, { useMemo, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";
import * as Haptics from "expo-haptics";

import { Amount } from "@/components/common/Amount";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

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
  const chartHeight = height - chartPaddingTop - chartPaddingBottom;

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

  const slotWidth = containerWidth / data.length;
  const barWidth = hasSecondary ? Math.min(slotWidth * 0.35, 14) : Math.min(slotWidth * 0.55, 24);

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {/* Selected Item Tooltip Header */}
      {selectedItem && (
        <View
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
        </View>
      )}

      {/* SVG Canvas */}
      <Svg width={containerWidth} height={height}>
        {/* Horizontal grid lines */}
        {[0, 0.5, 1].map((ratio, i) => {
          const y = chartPaddingTop + chartHeight * (1 - ratio);
          return (
            <Line
              key={i}
              x1={0}
              y1={y}
              x2={containerWidth}
              y2={y}
              stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}
              strokeDasharray="4 4"
              strokeWidth={1}
            />
          );
        })}

        {/* Bars */}
        <G>
          {data.map((item, idx) => {
            const isSelected = selectedIndex === idx;
            const slotCenterX = idx * slotWidth + slotWidth / 2;

            const h1 = Math.max((item.value / maxValue) * chartHeight, 2);
            const y1 = chartPaddingTop + chartHeight - h1;

            const color1 = item.color || defaultPrimaryColor;

            if (hasSecondary) {
              const h2 = Math.max(((item.secondaryValue ?? 0) / maxValue) * chartHeight, 2);
              const y2 = chartPaddingTop + chartHeight - h2;
              const color2 = item.secondaryColor || defaultSecondaryColor;

              const x1 = slotCenterX - barWidth - 1;
              const x2 = slotCenterX + 1;

              return (
                <G key={idx} onPress={() => handleSelectBar(idx)}>
                  {/* Primary Bar */}
                  <Rect
                    x={x1}
                    y={y1}
                    width={barWidth}
                    height={h1}
                    rx={4}
                    fill={color1}
                    opacity={selectedIndex === null || isSelected ? 1 : 0.4}
                  />
                  {/* Secondary Bar */}
                  <Rect
                    x={x2}
                    y={y2}
                    width={barWidth}
                    height={h2}
                    rx={4}
                    fill={color2}
                    opacity={selectedIndex === null || isSelected ? 1 : 0.4}
                  />
                  {/* X-axis Label */}
                  <SvgText
                    x={slotCenterX}
                    y={height - 8}
                    fontSize={10}
                    fontWeight={isSelected ? "800" : "500"}
                    fill={isSelected ? theme.colors.foreground : theme.colors.mutedForeground}
                    textAnchor="middle"
                  >
                    {item.label}
                  </SvgText>
                </G>
              );
            }

            const x = slotCenterX - barWidth / 2;
            return (
              <G key={idx} onPress={() => handleSelectBar(idx)}>
                <Rect
                  x={x}
                  y={y1}
                  width={barWidth}
                  height={h1}
                  rx={4}
                  fill={color1}
                  opacity={selectedIndex === null || isSelected ? 1 : 0.4}
                />
                {/* X-axis Label */}
                <SvgText
                  x={slotCenterX}
                  y={height - 8}
                  fontSize={10}
                  fontWeight={isSelected ? "800" : "500"}
                  fill={isSelected ? theme.colors.foreground : theme.colors.mutedForeground}
                  textAnchor="middle"
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
