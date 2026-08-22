import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react-native";

import {
  AnalyticsCard,
  AnalyticsCardMeta,
} from "@/components/analytics/monthly/AnalyticsCard";
import {
  insightAccents,
  insightSurface,
} from "@/components/analytics/insightsTheme";
import { Amount } from "@/components/common/Amount";
import { useSettings } from "@/providers/SettingsProvider";
import { formatAmountNumber } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface CashFlowCardProps {
  income: number;
  expenses: number;
  netSaved: number;
  savingsRate: number;
  projectedEndOfMonth: number;
  pacingPercentage: number;
  monthlyBudget: number;
  currency: string;
}

export function CashFlowCard({
  income,
  expenses,
  netSaved,
  savingsRate,
  projectedEndOfMonth,
  pacingPercentage,
  monthlyBudget,
  currency,
}: CashFlowCardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const surface = insightSurface(isDark);
  const accents = insightAccents(isDark);
  const { settings } = useSettings();

  const netPositive = netSaved >= 0;
  const roundedPacing = Math.round(pacingPercentage);
  const pacingColor =
    pacingPercentage > 15
      ? accents.pink
      : pacingPercentage < -5
        ? accents.green
        : theme.colors.foreground;

  const column = (
    label: string,
    value: number,
    color: string,
    trend: "up" | "down" | null,
    align: "flex-start" | "center" | "flex-end"
  ) => (
    <View style={[styles.column, { alignItems: align }]}>
      <Text
        style={[styles.columnLabel, { color: theme.colors.mutedForeground }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <View style={styles.valueRow}>
        <Amount
          value={value}
          currency={currency}
          ghostable
          animated
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          style={[styles.columnValue, { color }]}
        />
        {trend === "up" ? (
          <ArrowUpRight size={13} color={color} strokeWidth={2.6} />
        ) : trend === "down" ? (
          <ArrowDownRight size={13} color={color} strokeWidth={2.6} />
        ) : null}
      </View>
    </View>
  );

  return (
    <AnalyticsCard
      title="Monthly Cash Flow"
      icon={<Wallet size={16} color={accents.green} strokeWidth={2.4} />}
      right={
        monthlyBudget > 0 ? (
          <AnalyticsCardMeta>
            Budget: {currency}{" "}
            {formatAmountNumber(monthlyBudget, currency, {
              numberFormatStyle: settings?.numberFormat || "auto",
            })}
          </AnalyticsCardMeta>
        ) : undefined
      }
    >
      <View style={styles.row}>
        {column("Income", income, accents.green, income > 0 ? "up" : null, "flex-start")}
        <View style={[styles.vRule, { backgroundColor: surface.hairline }]} />
        {column(
          "Expenses",
          expenses,
          accents.pink,
          expenses > 0 ? "up" : null,
          "center"
        )}
        <View style={[styles.vRule, { backgroundColor: surface.hairline }]} />
        {column(
          "Net Saved",
          netSaved,
          netPositive ? accents.green : accents.pink,
          netPositive ? "up" : "down",
          "flex-end"
        )}
      </View>

      <View
        style={[
          styles.strip,
          { backgroundColor: surface.inset, borderColor: surface.insetBorder },
        ]}
      >
        <View style={styles.stripItem}>
          <Text
            style={[styles.stripLabel, { color: theme.colors.mutedForeground }]}
            numberOfLines={1}
          >
            Savings Rate
          </Text>
          <Text
            style={[
              styles.stripValue,
              {
                color:
                  savingsRate < 0
                    ? accents.pink
                    : savingsRate >= 20
                      ? accents.green
                      : theme.colors.foreground,
              },
            ]}
            numberOfLines={1}
          >
            {savingsRate}%
          </Text>
        </View>

        <View style={[styles.stripRule, { backgroundColor: surface.hairline }]} />

        <View style={styles.stripItem}>
          <Text
            style={[styles.stripLabel, { color: theme.colors.mutedForeground }]}
            numberOfLines={1}
          >
            Projected EOM
          </Text>
          <Amount
            value={projectedEndOfMonth}
            currency={currency}
            ghostable
            animated
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            style={[styles.stripValue, { color: theme.colors.foreground }]}
          />
        </View>

        <View style={[styles.stripRule, { backgroundColor: surface.hairline }]} />

        <View style={styles.stripItem}>
          <Text
            style={[styles.stripLabel, { color: theme.colors.mutedForeground }]}
            numberOfLines={1}
          >
            MTD Pacing
          </Text>
          <Text
            style={[styles.stripValue, { color: pacingColor }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {roundedPacing > 0 ? "+" : ""}
            {roundedPacing}% vs avg
          </Text>
        </View>
      </View>
    </AnalyticsCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  column: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  columnLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    maxWidth: "100%",
  },
  columnValue: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  vRule: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 10,
    alignSelf: "stretch",
  },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  stripItem: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 3,
  },
  stripLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
  stripValue: {
    fontSize: 12.5,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  stripRule: {
    width: StyleSheet.hairlineWidth,
    height: 26,
    marginHorizontal: 8,
  },
});
