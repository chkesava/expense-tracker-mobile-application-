import React from "react";
import { StyleSheet, Text } from "react-native";
import { TrendingUp } from "lucide-react-native";

import { AnalyticsCard } from "@/components/analytics/monthly/AnalyticsCard";
import { insightAccents } from "@/components/analytics/insightsTheme";
import {
  SpendingCurveChart,
  type CurvePoint,
} from "@/components/charts/SpendingCurveChart";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface DailySpendingCardProps {
  points: CurvePoint[];
  /** Formatted month label used in the subtitle. */
  monthLabel: string;
  currency: string;
}

export function DailySpendingCard({
  points,
  monthLabel,
  currency,
}: DailySpendingCardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const accents = insightAccents(isDark);

  const hasSpend = points.some((point) => point.amount > 0);

  return (
    <AnalyticsCard
      title="Daily Spending Run-Rate"
      icon={<TrendingUp size={16} color={accents.pink} strokeWidth={2.4} />}
      subtitle={`Daily trajectory and spikes across ${monthLabel}`}
      gap={10}
    >
      {hasSpend ? (
        <SpendingCurveChart
          points={points}
          height={186}
          currency={currency}
          lineColor={accents.pink}
          showYAxis
          xTickCount={5}
        />
      ) : (
        <Text style={[styles.empty, { color: theme.colors.mutedForeground }]}>
          No daily spending recorded for this month.
        </Text>
      )}
    </AnalyticsCard>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontSize: 12.5,
    fontWeight: "500",
    paddingVertical: 8,
  },
});
