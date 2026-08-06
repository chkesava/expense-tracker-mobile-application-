import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import {
  Award,
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronRight,
  PieChart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Card } from "@/components/ui/Card";
import { BarChart, type BarChartItem } from "@/components/charts/BarChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { groupByCategory } from "@/shared/utils/analytics";
import { COLORS } from "@/shared/utils/chartColors";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

export function YearlyAnalyticsView() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();

  const { expenses } = useExpenses();
  const { incomes } = useIncomes();

  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // Available years from dataset
  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear]);
    expenses.forEach((e) => {
      const y = parseInt(e.date?.slice(0, 4), 10);
      if (!isNaN(y)) years.add(y);
    });
    incomes.forEach((inc) => {
      const y = parseInt(inc.date?.slice(0, 4), 10);
      if (!isNaN(y)) years.add(y);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [expenses, incomes, currentYear]);

  // Year filtered transactions
  const yearExpenses = useMemo(
    () => expenses.filter((e) => e.date?.startsWith(String(selectedYear))),
    [expenses, selectedYear]
  );
  const yearIncomes = useMemo(
    () => incomes.filter((inc) => inc.date?.startsWith(String(selectedYear))),
    [incomes, selectedYear]
  );

  // Totals
  const totalAnnualExpense = useMemo(
    () => yearExpenses.reduce((sum, e) => sum + e.amount, 0),
    [yearExpenses]
  );
  const totalAnnualIncome = useMemo(
    () => yearIncomes.reduce((sum, inc) => sum + inc.amount, 0),
    [yearIncomes]
  );
  const netAnnualSavings = totalAnnualIncome - totalAnnualExpense;
  const monthlyAverageExpense = totalAnnualExpense / 12;

  // 12-Month Bar Chart Data
  const monthlyChartData: BarChartItem[] = useMemo(() => {
    return MONTH_NAMES.map((name, idx) => {
      const monthStr = `${selectedYear}-${String(idx + 1).padStart(2, "0")}`;
      const expSum = yearExpenses
        .filter((e) => e.month === monthStr || e.date?.startsWith(monthStr))
        .reduce((sum, e) => sum + e.amount, 0);
      const incSum = yearIncomes
        .filter((inc) => inc.date?.startsWith(monthStr))
        .reduce((sum, inc) => sum + inc.amount, 0);

      return {
        label: name,
        value: expSum,
        secondaryValue: incSum,
      };
    });
  }, [selectedYear, yearExpenses, yearIncomes]);

  // Peak and lowest spending months
  const { peakMonth, lowestMonth } = useMemo(() => {
    const activeMonths = monthlyChartData.filter((m) => m.value > 0);
    if (activeMonths.length === 0) return { peakMonth: null, lowestMonth: null };

    const sorted = [...activeMonths].sort((a, b) => b.value - a.value);
    return {
      peakMonth: sorted[0],
      lowestMonth: sorted[sorted.length - 1],
    };
  }, [monthlyChartData]);

  // Year-Long Category Distribution
  const categoryData = useMemo(() => {
    const grouped = groupByCategory(yearExpenses).sort((a, b) => b.value - a.value);
    return grouped.map((item, idx) => ({
      id: item.category,
      label: item.category,
      value: item.value,
      color: COLORS[idx % COLORS.length],
    }));
  }, [yearExpenses]);

  // Biggest Single Transaction
  const biggestExpense = useMemo(() => {
    if (yearExpenses.length === 0) return null;
    return [...yearExpenses].sort((a, b) => b.amount - a.amount)[0];
  }, [yearExpenses]);

  return (
    <View style={styles.container}>
      {/* Year Switcher Strip */}
      <View
        style={[
          styles.yearStrip,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            setSelectedYear((y) => y - 1);
          }}
          style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.6 }]}
        >
          <ChevronLeft size={20} color={theme.colors.foreground} />
        </Pressable>

        <View style={styles.yearLabelContainer}>
          <Text style={[styles.yearLabelText, { color: theme.colors.foreground }]}>
            {selectedYear}
          </Text>
          {selectedYear === currentYear && (
            <View
              style={[
                styles.currentBadge,
                { backgroundColor: isDark ? "rgba(99,102,241,0.2)" : "rgba(99,102,241,0.1)" },
              ]}
            >
              <Text style={[styles.currentBadgeText, { color: theme.colors.primary }]}>
                This Year
              </Text>
            </View>
          )}
        </View>

        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            setSelectedYear((y) => y + 1);
          }}
          style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.6 }]}
        >
          <ChevronRight size={20} color={theme.colors.foreground} />
        </Pressable>
      </View>

      {/* Annual Summary Hero Card */}
      <Card style={styles.heroCard}>
        <Text style={[styles.sectionSubtitle, { color: theme.colors.mutedForeground }]}>
          {selectedYear} ANNUAL OVERVIEW
        </Text>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryTile}>
            <Text style={[styles.summaryTileLabel, { color: theme.colors.mutedForeground }]}>
              Total Spent
            </Text>
            <Amount
              value={totalAnnualExpense}
              currency={system.defaultCurrency}
              ghostable
              style={{ fontSize: 18, fontWeight: "800", color: theme.colors.destructive }}
            />
          </View>

          <View style={styles.summaryTile}>
            <Text style={[styles.summaryTileLabel, { color: theme.colors.mutedForeground }]}>
              Total Income
            </Text>
            <Amount
              value={totalAnnualIncome}
              currency={system.defaultCurrency}
              ghostable
              style={{ fontSize: 18, fontWeight: "800", color: theme.colors.success }}
            />
          </View>

          <View style={styles.summaryTile}>
            <Text style={[styles.summaryTileLabel, { color: theme.colors.mutedForeground }]}>
              Net Savings
            </Text>
            <Amount
              value={netAnnualSavings}
              currency={system.defaultCurrency}
              ghostable
              style={{
                fontSize: 18,
                fontWeight: "800",
                color: netAnnualSavings >= 0 ? theme.colors.foreground : theme.colors.destructive,
              }}
            />
          </View>

          <View style={styles.summaryTile}>
            <Text style={[styles.summaryTileLabel, { color: theme.colors.mutedForeground }]}>
              Monthly Avg
            </Text>
            <Amount
              value={monthlyAverageExpense}
              currency={system.defaultCurrency}
              ghostable
              style={{ fontSize: 18, fontWeight: "800", color: theme.colors.foreground }}
            />
          </View>
        </View>
      </Card>

      {/* 12-Month Cashflow Bar Chart */}
      <Card style={styles.sectionCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderTitle}>
            <BarChart3 size={18} color={theme.colors.primary} />
            <Text style={[styles.cardTitleText, { color: theme.colors.foreground }]}>
              12-Month Income vs Spend
            </Text>
          </View>
        </View>

        <BarChart
          data={monthlyChartData}
          height={190}
          currency={system.defaultCurrency}
          primaryLabel="Spend"
          secondaryLabel="Income"
          primaryColor={theme.colors.destructive}
          secondaryColor={theme.colors.success}
          showLegend
        />

        {/* Peak & Lowest Spend Badges */}
        {peakMonth && lowestMonth && (
          <View style={styles.highlightsRow}>
            <View
              style={[
                styles.highlightBadge,
                {
                  backgroundColor: isDark
                    ? "rgba(239,68,68,0.12)"
                    : "rgba(239,68,68,0.06)",
                  borderColor: isDark
                    ? "rgba(239,68,68,0.3)"
                    : "rgba(239,68,68,0.2)",
                },
              ]}
            >
              <TrendingUp size={14} color="#EF4444" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#EF4444" }}>
                  Peak: {peakMonth.label}
                </Text>
                <Amount
                  value={peakMonth.value}
                  currency={system.defaultCurrency}
                  style={{ fontSize: 12, fontWeight: "800", color: theme.colors.foreground }}
                />
              </View>
            </View>

            <View
              style={[
                styles.highlightBadge,
                {
                  backgroundColor: isDark
                    ? "rgba(34,197,94,0.12)"
                    : "rgba(34,197,94,0.06)",
                  borderColor: isDark
                    ? "rgba(34,197,94,0.3)"
                    : "rgba(34,197,94,0.2)",
                },
              ]}
            >
              <TrendingDown size={14} color="#22C55E" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#22C55E" }}>
                  Lowest: {lowestMonth.label}
                </Text>
                <Amount
                  value={lowestMonth.value}
                  currency={system.defaultCurrency}
                  style={{ fontSize: 12, fontWeight: "800", color: theme.colors.foreground }}
                />
              </View>
            </View>
          </View>
        )}
      </Card>

      {/* Annual Category Breakdown Donut */}
      <Card style={styles.sectionCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderTitle}>
            <PieChart size={18} color={theme.colors.primary} />
            <Text style={[styles.cardTitleText, { color: theme.colors.foreground }]}>
              {selectedYear} Annual Distribution
            </Text>
          </View>
        </View>

        <DonutChart
          data={categoryData}
          size={190}
          strokeWidth={24}
          currency={system.defaultCurrency}
          title="Annual Spend"
        />
      </Card>

      {/* Single Largest Transaction Callout */}
      {biggestExpense && (
        <Card style={styles.sectionCard}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderTitle}>
              <Award size={18} color="#F59E0B" />
              <Text style={[styles.cardTitleText, { color: theme.colors.foreground }]}>
                Biggest Transaction of {selectedYear}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.recordRow,
              {
                backgroundColor: isDark
                  ? "rgba(245,158,11,0.1)"
                  : "rgba(245,158,11,0.06)",
                borderColor: isDark
                  ? "rgba(245,158,11,0.3)"
                  : "rgba(245,158,11,0.2)",
              },
            ]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={[styles.recordNote, { color: theme.colors.foreground }]}
                numberOfLines={1}
              >
                {biggestExpense.note || biggestExpense.category}
              </Text>
              <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
                {biggestExpense.date} • {biggestExpense.category}
              </Text>
            </View>
            <Amount
              value={biggestExpense.amount}
              currency={system.defaultCurrency}
              ghostable
              style={{ fontSize: 16, fontWeight: "900", color: "#F59E0B" }}
            />
          </View>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  yearStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  navBtn: {
    padding: 6,
    borderRadius: 10,
  },
  yearLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  yearLabelText: {
    fontSize: 16,
    fontWeight: "800",
  },
  currentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  heroCard: {
    padding: 16,
    gap: 14,
    borderRadius: 20,
  },
  sectionSubtitle: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  summaryTile: {
    width: "48%",
    padding: 12,
    borderRadius: 14,
    gap: 4,
  },
  summaryTileLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  sectionCard: {
    padding: 16,
    gap: 14,
    borderRadius: 20,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardHeaderTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitleText: {
    fontSize: 15,
    fontWeight: "800",
  },
  highlightsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  highlightBadge: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  recordNote: {
    fontSize: 14,
    fontWeight: "700",
  },
});
