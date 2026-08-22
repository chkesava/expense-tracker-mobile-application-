import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { CalendarRange } from "lucide-react-native";

import { AnalyticsCard } from "@/components/analytics/monthly/AnalyticsCard";
import { insightAccents } from "@/components/analytics/insightsTheme";
import { Amount } from "@/components/common/Amount";
import { DistributionBar } from "@/components/charts/DistributionBar";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface WeekendWeekdayCardProps {
  weekday: number;
  weekend: number;
  currency: string;
}

export function WeekendWeekdayCard({
  weekday,
  weekend,
  currency,
}: WeekendWeekdayCardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const accents = insightAccents(isDark);

  const total = weekday + weekend;
  const weekdayPercent = total > 0 ? Math.round((weekday / total) * 100) : 0;
  const weekendPercent = total > 0 ? 100 - weekdayPercent : 0;
  const weekdayColor = isDark ? "#F43F5E" : "#DC2626";

  return (
    <AnalyticsCard
      title="Weekend vs Weekday"
      icon={<CalendarRange size={16} color={accents.amber} strokeWidth={2.4} />}
      gap={12}
    >
      {total > 0 ? (
        <>
          <DistributionBar
            segments={[
              { label: "Weekday", value: weekday, color: weekdayColor },
              { label: "Weekend", value: weekend, color: accents.amber },
            ]}
            height={10}
            showLegend={false}
          />

          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: weekdayColor }]} />
              <Text
                style={[styles.legendLabel, { color: theme.colors.mutedForeground }]}
                numberOfLines={1}
              >
                Weekday ({weekdayPercent}%)
              </Text>
            </View>
            <View style={[styles.legendItem, styles.legendItemEnd]}>
              <View style={[styles.dot, { backgroundColor: accents.amber }]} />
              <Text
                style={[styles.legendLabel, { color: theme.colors.mutedForeground }]}
                numberOfLines={1}
              >
                Weekend ({weekendPercent}%)
              </Text>
            </View>
          </View>

          <View style={styles.amountRow}>
            <Amount
              value={weekday}
              currency={currency}
              ghostable
              numberOfLines={1}
              style={[styles.amount, { color: theme.colors.foreground }]}
            />
            <Amount
              value={weekend}
              currency={currency}
              ghostable
              numberOfLines={1}
              style={[
                styles.amount,
                styles.amountEnd,
                { color: theme.colors.foreground },
              ]}
            />
          </View>
        </>
      ) : (
        <Text style={[styles.empty, { color: theme.colors.mutedForeground }]}>
          No spending data available for this month.
        </Text>
      )}
    </AnalyticsCard>
  );
}

const styles = StyleSheet.create({
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  legendItem: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendItemEnd: {
    justifyContent: "flex-end",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  legendLabel: {
    fontSize: 11.5,
    fontWeight: "600",
    flexShrink: 1,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  amount: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  amountEnd: {
    textAlign: "right",
  },
  empty: {
    fontSize: 12.5,
    fontWeight: "500",
  },
});
