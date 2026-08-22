import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { CalendarRange, TrendingDown, TrendingUp } from "lucide-react-native";

import { AnalyticsCard } from "@/components/analytics/shared/AnalyticsCard";
import {
  insightAccents,
  insightSurface,
} from "@/components/analytics/insightsTheme";
import { Amount } from "@/components/common/Amount";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

/** A year-over-year delta. Null whenever the prior year can't support one. */
export type YoyDelta = {
  /** Signed percentage change against the previous year. */
  percent: number;
  /** Year the comparison is against, e.g. 2025. */
  againstYear: number;
} | null;

export interface AnnualMetric {
  label: string;
  value: number;
  color: string;
  delta: YoyDelta;
  /** Whether a rise in this metric is good news — drives the badge colour. */
  riseIsGood: boolean;
}

export interface AnnualOverviewCardProps {
  year: number;
  metrics: AnnualMetric[];
  currency: string;
}

export function AnnualOverviewCard({
  year,
  metrics,
  currency,
}: AnnualOverviewCardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const surface = insightSurface(isDark);
  const accents = insightAccents(isDark);

  return (
    <AnalyticsCard
      title={`${year} Annual Overview`}
      icon={<CalendarRange size={16} color={accents.green} strokeWidth={2.4} />}
      gap={12}
    >
      <View style={styles.grid}>
        {metrics.map((metric) => {
          const rose = (metric.delta?.percent ?? 0) > 0;
          const badgeColor = metric.delta
            ? rose === metric.riseIsGood
              ? accents.green
              : accents.pink
            : theme.colors.mutedForeground;

          return (
            <View
              key={metric.label}
              style={[
                styles.tile,
                {
                  backgroundColor: surface.inset,
                  borderColor: surface.insetBorder,
                },
              ]}
            >
              <Text
                style={[styles.label, { color: theme.colors.mutedForeground }]}
                numberOfLines={1}
              >
                {metric.label}
              </Text>
              <Amount
                value={metric.value}
                currency={currency}
                ghostable
                animated
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.68}
                style={[styles.value, { color: metric.color }]}
              />
              {metric.delta ? (
                <View style={styles.badgeRow}>
                  {rose ? (
                    <TrendingUp size={11} color={badgeColor} strokeWidth={2.6} />
                  ) : (
                    <TrendingDown size={11} color={badgeColor} strokeWidth={2.6} />
                  )}
                  <Text
                    style={[styles.badgeText, { color: badgeColor }]}
                    numberOfLines={1}
                  >
                    {rose ? "+" : ""}
                    {Math.round(metric.delta.percent)}% vs {metric.delta.againstYear}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </AnalyticsCard>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tile: {
    // Two per row on phones; the gap is absorbed by the percentage width.
    flexGrow: 1,
    flexBasis: "46%",
    minWidth: 0,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
  },
  value: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: "700",
    flexShrink: 1,
  },
});
