import React from "react";
import { StyleSheet, Text } from "react-native";
import { BarChart3 } from "lucide-react-native";

import { AnalyticsCard } from "@/components/analytics/shared/AnalyticsCard";
import { useInsightAccents } from "@/components/analytics/insightsTheme";
import { BarChart, type BarChartItem } from "@/components/charts/BarChart";
import { useTheme } from "@/theme/ThemeProvider";

export interface DayOfWeekCardProps {
  data: BarChartItem[];
  /** Weekday name with the highest spend, e.g. "Fri". Null when there is none. */
  peakDay: string | null;
  currency: string;
}

export function DayOfWeekCard({ data, peakDay, currency }: DayOfWeekCardProps) {
  const { theme } = useTheme();
  const accents = useInsightAccents();

  const hasSpend = data.some((item) => item.value > 0);

  return (
    <AnalyticsCard
      title="Spend by Day of Week"
      icon={<BarChart3 size={16} color={accents.positive} strokeWidth={2.4} />}
      subtitle={
        peakDay ? `${peakDay} is your heaviest spending day` : undefined
      }
      gap={8}
    >
      {hasSpend ? (
        <BarChart
          data={data}
          height={150}
          currency={currency}
          primaryLabel="Spent"
          primaryColor={accents.spend}
          showLegend={false}
        />
      ) : (
        <Text style={[styles.empty, { color: theme.colors.mutedForeground }]}>
          No spending data available for this month.
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
