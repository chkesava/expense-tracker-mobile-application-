import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { BarChart3, TrendingDown, TrendingUp } from "lucide-react-native";

import { AnalyticsCard } from "@/components/analytics/shared/AnalyticsCard";
import { insightAccents } from "@/components/analytics/insightsTheme";
import { Amount } from "@/components/common/Amount";
import { BarChart, type BarChartItem } from "@/components/charts/BarChart";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

/** A single named month plus its amount, e.g. { label: "Aug", value: 94206 }. */
export type MonthHighlight = { label: string; value: number } | null;

export interface IncomeVsSpendCardProps {
  data: BarChartItem[];
  peakSpend: MonthHighlight;
  lowestIncome: MonthHighlight;
  currency: string;
}

export function IncomeVsSpendCard({
  data,
  peakSpend,
  lowestIncome,
  currency,
}: IncomeVsSpendCardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const accents = insightAccents(isDark);

  const spendColor = isDark ? "#F43F5E" : "#DC2626";
  const incomeColor = accents.green;

  const highlight = (
    caption: string,
    highlightData: NonNullable<MonthHighlight>,
    color: string,
    tintRgb: string,
    direction: "up" | "down"
  ) => (
    <View
      style={[
        styles.highlight,
        {
          backgroundColor: `rgba(${tintRgb}, ${isDark ? 0.1 : 0.05})`,
          borderColor: `rgba(${tintRgb}, ${isDark ? 0.26 : 0.18})`,
        },
      ]}
    >
      <View style={styles.highlightHead}>
        {direction === "up" ? (
          <TrendingUp size={13} color={color} strokeWidth={2.5} />
        ) : (
          <TrendingDown size={13} color={color} strokeWidth={2.5} />
        )}
        <Text style={[styles.highlightCaption, { color }]} numberOfLines={1}>
          {caption}
        </Text>
      </View>
      <Text
        style={[styles.highlightMonth, { color: theme.colors.foreground }]}
        numberOfLines={1}
      >
        {highlightData.label}
      </Text>
      <Amount
        value={highlightData.value}
        currency={currency}
        ghostable
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.72}
        style={[styles.highlightValue, { color: theme.colors.foreground }]}
      />
    </View>
  );

  return (
    <AnalyticsCard
      title="12-Month Income vs Spend"
      icon={<BarChart3 size={16} color={accents.pink} strokeWidth={2.4} />}
      gap={10}
    >
      <BarChart
        data={data}
        height={210}
        currency={currency}
        primaryLabel="Spend"
        secondaryLabel="Income"
        primaryColor={spendColor}
        secondaryColor={incomeColor}
        showYAxis
        showLegend
      />

      {peakSpend || lowestIncome ? (
        <View style={styles.highlightRow}>
          {peakSpend
            ? highlight("Peak Spend", peakSpend, spendColor, "244, 63, 94", "up")
            : null}
          {lowestIncome
            ? highlight(
                "Lowest Income",
                lowestIncome,
                incomeColor,
                "74, 222, 128",
                "down"
              )
            : null}
        </View>
      ) : null}
    </AnalyticsCard>
  );
}

const styles = StyleSheet.create({
  highlightRow: {
    flexDirection: "row",
    gap: 10,
  },
  highlight: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    gap: 2,
  },
  highlightHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  highlightCaption: {
    fontSize: 11,
    fontWeight: "700",
    flexShrink: 1,
  },
  highlightMonth: {
    fontSize: 13,
    fontWeight: "700",
  },
  highlightValue: {
    fontSize: 14.5,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
});
