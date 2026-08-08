import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Polyline, Text as SvgText } from "react-native-svg";
import Animated, {
  FadeIn,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withSpring,
  ZoomIn,
} from "react-native-reanimated";

import { Card } from "@/components/ui/Card";
import type { AllocationSlice } from "@/shared/features/portfolio/types";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface PortfolioChartsProps {
  allocations: AllocationSlice[];
  sparklineData: number[];
  currency: string;
}

// ─── Donut Segment ──────────────────────────────────────────

function AnimatedAllocationSlice({
  cx,
  cy,
  radius,
  strokeWidth,
  color,
  rotation,
  dashLength,
  circumference,
  index,
}: {
  cx: number;
  cy: number;
  radius: number;
  strokeWidth: number;
  color: string;
  rotation: number;
  dashLength: number;
  circumference: number;
  index: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      index * 50,
      withSpring(1, { damping: 18, stiffness: 160, mass: 0.8 })
    );
  }, [dashLength, index, progress]);

  const animatedProps = useAnimatedProps(() => {
    const currentLength = dashLength * progress.value;
    const gap = Math.max(0, circumference - currentLength);
    return {
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
      strokeLinecap="butt"
      transform={`rotate(${rotation} ${cx} ${cy})`}
      animatedProps={animatedProps}
    />
  );
}

// ─── Donut Chart ──────────────────────────────────────────────

function AllocationDonut({
  slices,
  size = 140,
}: {
  slices: AllocationSlice[];
  size?: number;
}) {
  const { theme } = useTheme();
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 16;
  const strokeWidth = 22;

  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total <= 0) {
    return (
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>No data</Text>
      </View>
    );
  }

  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  return (
    <Animated.View entering={ZoomIn.springify().damping(18)}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background circle */}
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={theme.colors.muted}
          strokeWidth={strokeWidth}
        />
        {slices.map((slice, i) => {
          const pct = slice.value / total;
          const dashLength = pct * circumference;
          const rotation = cumulativeOffset * 360 - 90; // start from top
          cumulativeOffset += pct;

          return (
            <AnimatedAllocationSlice
              key={i}
              cx={cx}
              cy={cy}
              radius={radius}
              strokeWidth={strokeWidth}
              color={slice.color}
              rotation={rotation}
              dashLength={dashLength}
              circumference={circumference}
              index={i}
            />
          );
        })}
        {/* Center label */}
        <SvgText
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fontSize={11}
          fontWeight="800"
          fill={theme.colors.foreground}
        >
          {slices.length}
        </SvgText>
        <SvgText
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          fontSize={9}
          fill={theme.colors.mutedForeground}
        >
          Assets
        </SvgText>
      </Svg>
    </Animated.View>
  );
}

// ─── Sparkline Chart ──────────────────────────────────────────

function Sparkline({
  data,
  width = 220,
  height = 60,
}: {
  data: number[];
  width?: number;
  height?: number;
}) {
  const { theme } = useTheme();

  if (data.length < 2) {
    return (
      <View style={{ width, height, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: theme.colors.mutedForeground, fontSize: 11 }}>
          Not enough data
        </Text>
      </View>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 4;

  const points = data
    .map((val, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y = padding + (1 - (val - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const isPositive = data[data.length - 1] >= data[0];
  const lineColor = isPositive ? "#10B981" : "#EF4444";

  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Polyline
          points={points}
          fill="none"
          stroke={lineColor}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}

// ─── Combined Portfolio Charts ────────────────────────────────

export function PortfolioCharts({
  allocations,
  sparklineData,
  currency,
}: PortfolioChartsProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  return (
    <Card title="Portfolio Analytics" subtitle="Allocation & Performance">
      <View style={styles.container}>
        {/* Donut + Legend */}
        <View style={styles.donutSection}>
          <AllocationDonut slices={allocations} />
          <View style={styles.legend}>
            {allocations.map((slice, i) => (
              <View key={i} style={styles.legendRow}>
                <View
                  style={[styles.legendDot, { backgroundColor: slice.color }]}
                />
                <Text
                  style={[styles.legendLabel, { color: theme.colors.foreground }]}
                  numberOfLines={1}
                >
                  {slice.label}
                </Text>
                <Text
                  style={[
                    styles.legendValue,
                    { color: theme.colors.mutedForeground },
                  ]}
                >
                  {allocations.reduce((s, sl) => s + sl.value, 0) > 0
                    ? (
                        (slice.value /
                          allocations.reduce((s, sl) => s + sl.value, 0)) *
                        100
                      ).toFixed(1)
                    : "0"}
                  %
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Sparkline */}
        <View style={styles.sparklineSection}>
          <Text
            style={[
              styles.sparklineLabel,
              { color: theme.colors.mutedForeground },
            ]}
          >
            PORTFOLIO VALUE TREND
          </Text>
          <View
            style={[
              styles.sparklineBg,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(0,0,0,0.02)",
              },
            ]}
          >
            <Sparkline data={sparklineData} />
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  donutSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  legend: {
    flex: 1,
    gap: 6,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
  },
  legendValue: {
    fontSize: 11,
    fontWeight: "700",
  },
  sparklineSection: {
    gap: 6,
  },
  sparklineLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  sparklineBg: {
    borderRadius: 10,
    padding: 8,
    alignItems: "center",
  },
});
