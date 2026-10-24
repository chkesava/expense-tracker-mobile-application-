import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";
import Animated, { FadeIn, ZoomIn, useReducedMotion } from "react-native-reanimated";

import { Amount } from "@/components/common/Amount";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";
import { donutSliceAt, donutTapTarget, pressPoint } from "@/shared/utils/chartHitTest";

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
  /** Fraction digits for the centre figure (default: the currency's own). */
  centerFractionDigits?: number;
  /** Put the title under the figure, sentence case (Visual First, SPENDLY-572). */
  titleBelow?: boolean;
  /**
   * SPENDLY-574 drill-down: a tap inside the hole calls this instead of
   * clearing the selection.
   */
  onCenterPress?: () => void;
  /** SPENDLY-574 drill-down: a tap on a slice calls this instead of selecting it. */
  onSlicePress?: (segment: DonutSegment, index: number) => void;
  /** Accessible name for the centre when `onCenterPress` is set. */
  centerAccessibilityLabel?: string;
}

/**
 * A static slice. The chart's entrance is the wrapping `ZoomIn` view: animating
 * each SVG circle with Reanimated pushed synchronous props to native views that
 * were not (or no longer) mounted, logging a stack trace per frame (SPENDLY-489).
 */
function DonutSlice({
  cx,
  cy,
  radius,
  strokeWidth,
  color,
  rotation,
  sliceLength,
  circumference,
  isSelected,
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
}) {
  const gap = Math.max(0, circumference - sliceLength);
  return (
    <Circle
      cx={cx}
      cy={cy}
      r={isSelected ? radius + 2 : radius}
      fill="none"
      stroke={color}
      strokeWidth={isSelected ? strokeWidth + 4 : strokeWidth}
      strokeLinecap="round"
      strokeDasharray={`${sliceLength} ${gap}`}
      transform={`rotate(${rotation} ${cx} ${cy})`}
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
  centerFractionDigits,
  titleBelow = false,
  onCenterPress,
  onSlicePress,
  centerAccessibilityLabel,
}: DonutChartProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();

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
    haptic.selection().catch(() => undefined);
    setSelectedIndex((prev) => (prev === idx ? null : idx));
  };

  const fractions = useMemo(
    () => (total > 0 ? validData.map((d) => d.value / total) : []),
    [validData, total]
  );

  const handleChartPress = (event: GestureResponderEvent) => {
    const point = pressPoint(event.nativeEvent);
    if (!point) return;
    if (onCenterPress || onSlicePress) {
      // Drill-down mode (SPENDLY-574): centre and slices navigate.
      const target = donutTapTarget(
        point.x - center,
        point.y - center,
        radius - strokeWidth / 2 - 8,
        radius + strokeWidth / 2 + 8,
        fractions
      );
      if (target?.kind === "center" && onCenterPress) {
        haptic.selection().catch(() => undefined);
        onCenterPress();
        return;
      }
      if (target?.kind === "slice" && onSlicePress) {
        const segment = validData[target.index];
        if (segment) {
          haptic.selection().catch(() => undefined);
          onSlicePress(segment, target.index);
          return;
        }
      }
      if (!target) setSelectedIndex(null);
      else if (target.kind === "slice") handleSelect(target.index);
      return;
    }
    // A little slack either side of the stroke so thin rings stay tappable.
    const slice = donutSliceAt(
      point.x - center,
      point.y - center,
      radius - strokeWidth / 2 - 8,
      radius + strokeWidth / 2 + 8,
      fractions
    );
    if (slice === null) setSelectedIndex(null);
    else handleSelect(slice);
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
        entering={reduceMotion ? undefined : ZoomIn.springify().damping(18)}
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
              <DonutSlice
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
              />
            ))}
          </G>
        </Svg>

        {/* Center metric. Also the chart's one tap target (SPENDLY-533): a tap
            on the ring selects that slice, anywhere else clears the
            selection. SVG shapes take no onPress — on web react-native-svg
            forwards the responder props to the DOM and React warns. The
            legend below stays the accessible way to pick a slice. */}
        <Pressable
          style={styles.centerOverlay}
          onPress={handleChartPress}
          accessibilityRole="button"
          accessibilityLabel={
            onCenterPress && centerAccessibilityLabel
              ? centerAccessibilityLabel
              : activeItem
                ? `Clear ${activeItem.label} selection`
                : title
          }
          accessibilityHint={onCenterPress ? "Opens the spending details" : undefined}
        >
          {/* Children never take the touch, so locationX/Y always measure
              from the chart's own box. */}
          <View pointerEvents="none" style={styles.centerContent}>
          {titleBelow ? null : (
            <Text
              style={[
                styles.centerSub,
                { color: theme.colors.mutedForeground, fontSize: theme.typography.xs },
              ]}
              numberOfLines={1}
            >
              {activeItem ? activeItem.label : title}
            </Text>
          )}
          <Amount
            value={activeItem ? activeItem.value : total}
            currency={currency}
            fractionDigits={centerFractionDigits}
            animated
            ghostable
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{
              fontSize: activeItem ? 18 : 20,
              // SPENDLY-572: the theme font, not a heavy system fallback.
              fontFamily: theme.fontFamily.bold,
              color: theme.colors.foreground,
              fontVariant: ["tabular-nums"],
            }}
          />
          {titleBelow ? (
            <Text
              style={{ color: theme.colors.mutedForeground, fontSize: 13, fontFamily: theme.fontFamily.regular, marginTop: 1 }}
              numberOfLines={1}
            >
              {activeItem ? activeItem.label : title}
            </Text>
          ) : null}
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
          </View>
        </Pressable>
      </Animated.View>

      {/* Interactive Legend Grid */}
      {showLegend && (
        <Animated.View entering={reduceMotion ? undefined : FadeIn.delay(100)} style={styles.legendContainer}>
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
  centerContent: {
    alignItems: "center",
    maxWidth: "100%",
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
