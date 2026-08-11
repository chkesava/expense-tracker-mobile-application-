import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Banknote,
  Calendar,
  ChevronRight,
  Landmark,
  Percent,
  TrendingUp,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Card } from "@/components/ui/Card";
import type { Investment } from "@/shared/types/investment";
import { todayDateKey } from "@/shared/utils/dates";
import { getInvestmentValuation } from "@/shared/utils/investmentInterest";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface InvestmentCardProps {
  investment: Investment;
  currency: string;
  onPress: () => void;
}

export function InvestmentCard({
  investment,
  currency,
  onPress,
}: InvestmentCardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const today = todayDateKey();
  const valuation = useMemo(() => {
    return getInvestmentValuation(investment, today);
  }, [investment, today]);

  const kindLabel =
    investment.kind === "fixed_deposit"
      ? "Fixed Deposit"
      : investment.kind === "interest_savings"
      ? "Interest Savings"
      : "Mutual Fund";

  const kindColor =
    investment.kind === "fixed_deposit"
      ? "#3B82F6"
      : investment.kind === "interest_savings"
      ? "#10B981"
      : "#8B5CF6";

  const isClosed = investment.status === "closed";
  const profit = valuation.totalValue - investment.principal;
  const returnRate =
    investment.principal > 0
      ? ((profit / investment.principal) * 100).toFixed(1)
      : "0.0";

  return (
    <Card
      onPress={onPress}
      elevation={2}
      contentStyle={styles.pressable}
      disabled={isClosed}
      style={[
        styles.card,
        { borderColor: theme.colors.border },
      ]}
    >
      <View style={styles.header}>
          <View style={styles.titleCol}>
            <View style={styles.kindRow}>
              <View
                style={[
                  styles.kindIcon,
                  { backgroundColor: `${kindColor}20` },
                ]}
              >
                {investment.kind === "fixed_deposit" ? (
                  <Landmark size={15} color={kindColor} />
                ) : investment.kind === "interest_savings" ? (
                  <Banknote size={15} color={kindColor} />
                ) : (
                  <TrendingUp size={15} color={kindColor} />
                )}
              </View>
              <Text
                style={[styles.kindText, { color: kindColor }]}
              >
                {kindLabel}
              </Text>

              {/* Status Badge */}
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: isClosed
                      ? "rgba(100,116,139,0.15)"
                      : "rgba(34,197,94,0.15)",
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 9,
                    fontWeight: "800",
                    color: isClosed ? "#64748B" : "#22C55E",
                    textTransform: "uppercase",
                  }}
                >
                  {investment.status}
                </Text>
              </View>
            </View>

            <Text
              style={[styles.name, { color: theme.colors.foreground }]}
              numberOfLines={1}
            >
              {investment.name}
            </Text>
          </View>

          <ChevronRight size={18} color={theme.colors.mutedForeground} />
        </View>

        {/* Financial Metrics */}
        <View style={styles.metricsRow}>
          <View style={styles.metricBlock}>
            <Text style={[styles.metricLabel, { color: theme.colors.mutedForeground }]}>
              PRINCIPAL
            </Text>
            <Amount
              value={investment.principal}
              currency={currency}
              style={{ fontSize: 15, fontWeight: "700", color: theme.colors.foreground }}
            />
          </View>

          <View style={[styles.metricBlock, { alignItems: "flex-end" }]}>
            <Text style={[styles.metricLabel, { color: theme.colors.mutedForeground }]}>
              CURRENT VALUATION
            </Text>
            <Amount
              value={valuation.totalValue}
              currency={currency}
              style={{
                fontSize: 16,
                fontWeight: "900",
                color: profit >= 0 ? theme.colors.foreground : theme.colors.destructive,
              }}
            />
          </View>
        </View>

        {/* Footer Info: Rate & Maturity */}
        <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
          <View style={styles.footerLeft}>
            {investment.annualInterestRate !== undefined ? (
              <View style={styles.rateBadge}>
                <Percent size={12} color="#10B981" />
                <Text style={{ fontSize: 11, fontWeight: "800", color: "#10B981" }}>
                  {investment.annualInterestRate}% p.a.
                </Text>
              </View>
            ) : investment.kind === "mutual_fund" ? (
              <View style={styles.rateBadge}>
                <TrendingUp size={12} color={profit >= 0 ? "#10B981" : "#EF4444"} />
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "800",
                    color: profit >= 0 ? "#10B981" : "#EF4444",
                  }}
                >
                  {profit >= 0 ? `+${returnRate}%` : `${returnRate}%`}
                </Text>
              </View>
            ) : null}

            {profit > 0 && (
              <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
                +{currency} {Math.round(profit).toLocaleString()} gain
              </Text>
            )}
          </View>

          {investment.maturityDate && (
            <View style={styles.maturityInfo}>
              <Calendar size={12} color={theme.colors.mutedForeground} />
              <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
                Matures: {investment.maturityDate}
              </Text>
            </View>
          )}
        </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: "hidden",
  },
  pressable: {
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleCol: {
    flex: 1,
    gap: 4,
  },
  kindRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  kindIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  kindText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: "800",
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metricBlock: {
    gap: 2,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(16,185,129,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  maturityInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
});
