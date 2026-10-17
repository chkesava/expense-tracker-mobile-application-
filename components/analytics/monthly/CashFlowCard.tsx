import React from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react-native";

import {
  AnalyticsCard,
  AnalyticsCardMeta,
} from "@/components/analytics/shared/AnalyticsCard";
import {
  useInsightAccents,
  useInsightSurface,
} from "@/components/analytics/insightsTheme";
import { Amount } from "@/components/common/Amount";
import { useTheme } from "@/theme/ThemeProvider";

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
  const { theme } = useTheme();
  const surface = useInsightSurface();
  const accents = useInsightAccents();
  // adjustsFontSizeToFit is native-only, so web would truncate "₹98,000" to
  // "₹98,…" on 320 dp screens; step the figures down on narrow windows instead.
  const compact = useWindowDimensions().width < 360;

  const netPositive = netSaved >= 0;
  const roundedPacing = Math.round(pacingPercentage);
  const pacingColor =
    pacingPercentage > 15
      ? accents.negative
      : pacingPercentage < -5
        ? accents.positive
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
          style={[styles.columnValue, compact && styles.columnValueCompact, { color }]}
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
      icon={<Wallet size={16} color={accents.positive} strokeWidth={2.4} />}
      right={
        monthlyBudget > 0 ? (
          <AnalyticsCardMeta>
            Budget:{" "}
            <Amount
              value={monthlyBudget}
              currency={currency}
              ghostable
              style={styles.budget}
            />
          </AnalyticsCardMeta>
        ) : undefined
      }
    >
      <View style={styles.row}>
        {column("Income", income, accents.positive, income > 0 ? "up" : null, "flex-start")}
        <View style={[styles.vRule, { backgroundColor: surface.hairline }]} />
        {column(
          "Expenses",
          expenses,
          accents.spend,
          expenses > 0 ? "up" : null,
          "center"
        )}
        <View style={[styles.vRule, { backgroundColor: surface.hairline }]} />
        {column(
          "Net Saved",
          netSaved,
          netPositive ? accents.positive : accents.negative,
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
              compact && styles.stripValueCompact,
              {
                color:
                  savingsRate < 0
                    ? accents.negative
                    : savingsRate >= 20
                      ? accents.positive
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
            style={[styles.stripValue, compact && styles.stripValueCompact, { color: theme.colors.foreground }]}
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
            style={[styles.stripValue, compact && styles.stripValueCompact, { color: pacingColor }]}
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
  budget: {
    fontSize: 11,
    fontWeight: "800",
  },
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
  columnValueCompact: {
    fontSize: 14,
    letterSpacing: -0.3,
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
  stripValueCompact: {
    fontSize: 11,
  },
  stripRule: {
    width: StyleSheet.hairlineWidth,
    height: 26,
    marginHorizontal: 8,
  },
});
