import React, { useMemo, useState } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ChevronDown, ChevronUp, PieChart } from "lucide-react-native";

import {
  AnalyticsCard,
  AnalyticsCardMeta,
} from "@/components/analytics/shared/AnalyticsCard";
import {
  insightAccents,
  insightSurface,
} from "@/components/analytics/insightsTheme";
import { Amount } from "@/components/common/Amount";
import { DonutChart, type DonutSegment } from "@/components/charts/DonutChart";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

/** Rows shown before the "view all" disclosure kicks in. */
const COLLAPSED_ROWS = 5;
/** Content width at which the donut and the legend sit side by side. */
const SIDE_BY_SIDE_WIDTH = 460;

export interface CategoryDistributionCardProps {
  /** Pre-sorted, pre-coloured category slices from the analytics layer. */
  data: DonutSegment[];
  total: number;
  currency: string;
  /** Card heading — "Category Distribution", "2026 Annual Distribution". */
  title?: string;
  /** Donut centre caption — "Total Spent", "Annual Spend". */
  centerTitle?: string;
  /** Copy shown when the period has no spending. */
  emptyMessage?: string;
}

export function CategoryDistributionCard({
  data,
  total,
  currency,
  title = "Category Distribution",
  centerTitle = "Total Spent",
  emptyMessage = "No spending data available for this month.",
}: CategoryDistributionCardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const surface = insightSurface(isDark);
  const accents = insightAccents(isDark);

  const [expanded, setExpanded] = useState(false);
  const [contentWidth, setContentWidth] = useState(0);

  const handleLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next > 0 && Math.abs(next - contentWidth) > 1) setContentWidth(next);
  };

  const sideBySide = contentWidth >= SIDE_BY_SIDE_WIDTH;

  /**
   * Long tails make the legend taller than the chart, so everything past the
   * fifth slice folds into a single "Others" row until the user expands.
   */
  const rows = useMemo(() => {
    if (data.length <= COLLAPSED_ROWS + 1 || expanded) {
      return data.map((item) => ({ ...item, isOthers: false }));
    }
    const head = data.slice(0, COLLAPSED_ROWS).map((item) => ({
      ...item,
      isOthers: false,
    }));
    const tail = data.slice(COLLAPSED_ROWS);
    const tailTotal = tail.reduce((sum, item) => sum + item.value, 0);
    return [
      ...head,
      {
        id: "__others__",
        label: `Others (${tail.length})`,
        value: tailTotal,
        color: isDark ? "#64748B" : "#94A3B8",
        isOthers: true,
      },
    ];
  }, [data, expanded, isDark]);

  const canExpand = data.length > COLLAPSED_ROWS + 1;

  if (data.length === 0 || total <= 0) {
    return (
      <AnalyticsCard
        title={title}
        icon={<PieChart size={16} color={accents.pink} strokeWidth={2.4} />}
      >
        <Text style={[styles.empty, { color: theme.colors.mutedForeground }]}>
          {emptyMessage}
        </Text>
      </AnalyticsCard>
    );
  }

  const donutSize = sideBySide ? 176 : Math.min(196, Math.max(150, contentWidth * 0.58));

  const legend = (
    <View style={styles.legend}>
      {rows.map((item, index) => {
        const percent = Math.round((item.value / total) * 100);
        return (
          <View
            key={item.id ?? `${item.label}-${index}`}
            style={[
              styles.legendRow,
              index < rows.length - 1 && {
                borderBottomColor: surface.hairline,
                borderBottomWidth: StyleSheet.hairlineWidth,
              },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: item.color }]} />
            <Text
              style={[styles.legendLabel, { color: theme.colors.foreground }]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
            <Text
              style={[styles.legendPercent, { color: theme.colors.mutedForeground }]}
              numberOfLines={1}
            >
              {percent}%
            </Text>
            <Amount
              value={item.value}
              currency={currency}
              ghostable
              numberOfLines={1}
              style={[styles.legendAmount, { color: theme.colors.foreground }]}
            />
          </View>
        );
      })}

      {canExpand ? (
        <Pressable
          onPress={() => {
            void haptic.selection();
            setExpanded((prev) => !prev);
          }}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.expandBtn,
            { backgroundColor: surface.inset, borderColor: surface.insetBorder },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.expandText, { color: accents.green }]}>
            {expanded ? "Show top 5" : `View all ${data.length} categories`}
          </Text>
          {expanded ? (
            <ChevronUp size={14} color={accents.green} strokeWidth={2.4} />
          ) : (
            <ChevronDown size={14} color={accents.green} strokeWidth={2.4} />
          )}
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <AnalyticsCard
      title={title}
      icon={<PieChart size={16} color={accents.pink} strokeWidth={2.4} />}
      right={<AnalyticsCardMeta>{data.length} categories</AnalyticsCardMeta>}
    >
      <View
        onLayout={handleLayout}
        style={sideBySide ? styles.splitLayout : styles.stackLayout}
      >
        <View style={styles.chartSlot}>
          <DonutChart
            data={data}
            size={donutSize}
            strokeWidth={sideBySide ? 22 : 24}
            currency={currency}
            title={centerTitle}
            showLegend={false}
          />
        </View>
        <View style={sideBySide ? styles.legendSlotSplit : styles.legendSlotStack}>
          {legend}
        </View>
      </View>
    </AnalyticsCard>
  );
}

const styles = StyleSheet.create({
  stackLayout: {
    gap: 14,
  },
  splitLayout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  chartSlot: {
    alignItems: "center",
    justifyContent: "center",
  },
  legendSlotStack: {
    width: "100%",
  },
  legendSlotSplit: {
    flex: 1,
    minWidth: 0,
  },
  legend: {
    width: "100%",
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    flexShrink: 0,
  },
  legendLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 12.5,
    fontWeight: "600",
  },
  legendPercent: {
    fontSize: 11.5,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    minWidth: 34,
    textAlign: "right",
  },
  legendAmount: {
    fontSize: 12.5,
    fontWeight: "700",
    textAlign: "right",
  },
  expandBtn: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 38,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  expandText: {
    fontSize: 12,
    fontWeight: "700",
  },
  empty: {
    fontSize: 12.5,
    fontWeight: "500",
    paddingVertical: 6,
  },
  pressed: {
    opacity: 0.75,
  },
});
