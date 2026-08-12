import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  Info,
  Layers,
  PieChart,
  Plus,
  ShoppingBag,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { Card } from "@/components/ui/Card";
import { BarChart } from "@/components/charts/BarChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { SpendingCurveChart } from "@/components/charts/SpendingCurveChart";
import { DistributionBar } from "@/components/charts/DistributionBar";
import { useAccounts } from "@/hooks/useAccounts";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useSettings } from "@/providers/SettingsProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { getCategoryIcon } from "@/shared/data/categoryTaxonomy";
import { COLORS } from "@/shared/utils/chartColors";
import { getSmartInsight } from "@/shared/utils/insights";
import { getPacingMetrics } from "@/shared/utils/insightMetrics";
import {
  getAnomalies,
  getDailySpendingSeries,
  getDayOfWeekDistribution,
  getTopVendors,
  getWeekendVsWeekdaySplit,
} from "@/shared/utils/rangeAnalytics";
import { groupByCategory } from "@/shared/utils/analytics";
import { currentMonthKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function MonthlyAnalyticsView() {
  const router = useRouter();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: userSettings } = useSettings();
  const { settings: system } = useSystemSettings();

  const { expenses } = useExpenses();
  const { incomes } = useIncomes();
  const { accounts } = useAccounts();

  // Current month state "YYYY-MM"
  const currentMonthStr = useMemo(() => currentMonthKey(), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);

  const monthlyBudget = userSettings.monthlyBudget || 0;

  // Month navigation
  const handlePrevMonth = () => {
    Haptics.selectionAsync().catch(() => undefined);
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    const nextKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setSelectedMonth(nextKey);
  };

  const handleNextMonth = () => {
    Haptics.selectionAsync().catch(() => undefined);
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m, 1);
    const nextKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setSelectedMonth(nextKey);
  };

  const formattedMonthLabel = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [selectedMonth]);

  // Filtered transactions for selected month
  const monthExpenses = useMemo(
    () => expenses.filter((e) => e.month === selectedMonth),
    [expenses, selectedMonth]
  );
  const monthIncomes = useMemo(
    () => incomes.filter((inc) => inc.date.slice(0, 7) === selectedMonth),
    [incomes, selectedMonth]
  );

  // Totals & Cashflow
  const totalExpense = useMemo(
    () => monthExpenses.reduce((sum, e) => sum + e.amount, 0),
    [monthExpenses]
  );
  const totalIncome = useMemo(
    () => monthIncomes.reduce((sum, inc) => sum + inc.amount, 0),
    [monthIncomes]
  );
  const netSavings = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;

  // Smart Insight & Pacing
  const smartInsight = useMemo(
    () => getSmartInsight(monthExpenses, monthlyBudget, selectedMonth),
    [monthExpenses, monthlyBudget, selectedMonth]
  );

  const pacing = useMemo(
    () => getPacingMetrics(expenses, selectedMonth),
    [expenses, selectedMonth]
  );

  // Category breakdown
  const categoryData = useMemo(() => {
    const grouped = groupByCategory(monthExpenses).sort((a, b) => b.value - a.value);
    return grouped.map((item, idx) => ({
      id: item.category,
      label: item.category,
      value: item.value,
      color: COLORS[idx % COLORS.length],
    }));
  }, [monthExpenses]);

  // Daily Spending Curve Points
  const dailyPoints = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const totalDays = new Date(y, m, 0).getDate();
    const startDate = `${selectedMonth}-01`;
    const endDate = `${selectedMonth}-${String(totalDays).padStart(2, "0")}`;
    const series = getDailySpendingSeries(monthExpenses, startDate, endDate);
    return series.map((s) => ({
      date: s.date.slice(8), // day number "01", "02"
      amount: s.amount,
    }));
  }, [monthExpenses, selectedMonth]);

  // Deep Analytics
  const weekendVsWeekday = useMemo(
    () => getWeekendVsWeekdaySplit(monthExpenses),
    [monthExpenses]
  );
  const topVendors = useMemo(() => getTopVendors(monthExpenses).slice(0, 5), [monthExpenses]);
  const anomalies = useMemo(() => getAnomalies(monthExpenses), [monthExpenses]);
  const dayOfWeekData = useMemo(() => {
    const dist = getDayOfWeekDistribution(monthExpenses);
    return dist.map((d) => ({ label: d.name, value: d.amount }));
  }, [monthExpenses]);

  return (
    <View style={styles.container}>
      {/* Month Navigator Strip */}
      <View
        style={[
          styles.monthStrip,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Pressable
          onPress={handlePrevMonth}
          style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.6 }]}
        >
          <ChevronLeft size={20} color={theme.colors.foreground} />
        </Pressable>

        <View style={styles.monthLabelContainer}>
          <Text style={[styles.monthLabelText, { color: theme.colors.foreground }]}>
            {formattedMonthLabel}
          </Text>
          {selectedMonth === currentMonthStr && (
            <View
              style={[
                styles.currentBadge,
                { backgroundColor: isDark ? "rgba(99,102,241,0.2)" : "rgba(99,102,241,0.1)" },
              ]}
            >
              <Text style={[styles.currentBadgeText, { color: theme.colors.primary }]}>
                Current
              </Text>
            </View>
          )}
        </View>

        <Pressable
          onPress={handleNextMonth}
          style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.6 }]}
        >
          <ChevronRight size={20} color={theme.colors.foreground} />
        </Pressable>
      </View>

      {monthExpenses.length === 0 ? (
        <EmptyState
          illustration="analytics"
          title="No Data For This Month"
          description="Log a few expenses or incomes in this month to generate category breakdowns, spending velocity, and cash flow trends."
          primaryAction={{
            label: "Log Expense",
            icon: <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />,
            onPress: () => router.push("/dashboard"),
          }}
          secondaryAction={{
            label: "Previous Month",
            onPress: handlePrevMonth,
          }}
          tip="Analytics become significantly more actionable once you log at least 5 transactions in a month."
        />
      ) : (
        <>
          {/* Smart Financial Health Banner */}
      <View
        style={[
          styles.insightBanner,
          {
            backgroundColor:
              smartInsight.type === "danger"
                ? isDark
                  ? "rgba(239,68,68,0.14)"
                  : "rgba(239,68,68,0.08)"
                : smartInsight.type === "warning"
                ? isDark
                  ? "rgba(245,158,11,0.14)"
                  : "rgba(245,158,11,0.08)"
                : isDark
                ? "rgba(34,197,94,0.14)"
                : "rgba(34,197,94,0.08)",
            borderColor:
              smartInsight.type === "danger"
                ? "#EF4444"
                : smartInsight.type === "warning"
                ? "#F59E0B"
                : "#22C55E",
          },
        ]}
      >
        <View style={styles.insightIconBox}>
          {smartInsight.type === "danger" ? (
            <AlertTriangle size={20} color="#EF4444" />
          ) : smartInsight.type === "warning" ? (
            <Flame size={20} color="#F59E0B" />
          ) : (
            <Sparkles size={20} color="#22C55E" />
          )}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={[
              styles.insightTitle,
              {
                color:
                  smartInsight.type === "danger"
                    ? "#EF4444"
                    : smartInsight.type === "warning"
                    ? "#F59E0B"
                    : "#22C55E",
              },
            ]}
          >
            {smartInsight.type === "danger"
              ? "Overspending Alert"
              : smartInsight.type === "warning"
              ? "Budget Warning"
              : "Financial Health"}
          </Text>
          <Text style={[styles.insightBody, { color: theme.colors.foreground }]}>
            {smartInsight.message}
          </Text>
        </View>
      </View>

      {/* Net Cash Flow Hero Card */}
      <Card style={styles.heroCard}>
        <View style={styles.cardHeader}>
          <Text style={[styles.sectionSubtitle, { color: theme.colors.mutedForeground }]}>
            MONTHLY CASH FLOW
          </Text>
          {monthlyBudget > 0 && (
            <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
              Budget: {system.defaultCurrency} {monthlyBudget}
            </Text>
          )}
        </View>

        <View style={styles.cashflowRow}>
          <View style={styles.cashflowCol}>
            <Text style={[styles.cashflowLabel, { color: theme.colors.mutedForeground }]}>
              Income
            </Text>
            <Amount
              value={totalIncome}
              currency={system.defaultCurrency}
              ghostable
              animated
              style={{ fontSize: 18, fontWeight: "800", color: theme.colors.success }}
            />
          </View>
          <View style={[styles.cashflowDivider, { backgroundColor: theme.colors.border }]} />
          <View style={styles.cashflowCol}>
            <Text style={[styles.cashflowLabel, { color: theme.colors.mutedForeground }]}>
              Expenses
            </Text>
            <Amount
              value={totalExpense}
              currency={system.defaultCurrency}
              ghostable
              animated
              style={{ fontSize: 18, fontWeight: "800", color: theme.colors.destructive }}
            />
          </View>
          <View style={[styles.cashflowDivider, { backgroundColor: theme.colors.border }]} />
          <View style={styles.cashflowCol}>
            <Text style={[styles.cashflowLabel, { color: theme.colors.mutedForeground }]}>
              Net Saved
            </Text>
            <Amount
              value={netSavings}
              currency={system.defaultCurrency}
              ghostable
              animated
              style={{
                fontSize: 18,
                fontWeight: "800",
                color: netSavings >= 0 ? theme.colors.foreground : theme.colors.destructive,
              }}
            />
          </View>
        </View>

        {/* Pacing & Savings Rate Strip */}
        <View
          style={[
            styles.pacingStrip,
            {
              backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.pacingItem}>
            <Text style={[styles.pacingLabel, { color: theme.colors.mutedForeground }]}>
              Savings Rate
            </Text>
            <Text
              style={[
                styles.pacingValue,
                { color: savingsRate >= 20 ? theme.colors.success : theme.colors.foreground },
              ]}
            >
              {savingsRate}%
            </Text>
          </View>

          <View style={[styles.pacingDotDivider, { backgroundColor: theme.colors.border }]} />

          <View style={styles.pacingItem}>
            <Text style={[styles.pacingLabel, { color: theme.colors.mutedForeground }]}>
              Projected EOM
            </Text>
            <Amount
              value={pacing.projectedEndMonthTotal}
              currency={system.defaultCurrency}
              ghostable
              animated
              style={{ fontSize: 13, fontWeight: "700", color: theme.colors.foreground }}
            />
          </View>

          <View style={[styles.pacingDotDivider, { backgroundColor: theme.colors.border }]} />

          <View style={styles.pacingItem}>
            <Text style={[styles.pacingLabel, { color: theme.colors.mutedForeground }]}>
              MTD Pacing
            </Text>
            <Text
              style={[
                styles.pacingValue,
                {
                  color:
                    pacing.pacingPercentage > 15
                      ? theme.colors.destructive
                      : pacing.pacingPercentage < -5
                      ? theme.colors.success
                      : theme.colors.foreground,
                },
              ]}
            >
              {pacing.pacingPercentage > 0 ? "+" : ""}
              {Math.round(pacing.pacingPercentage)}% vs avg
            </Text>
          </View>
        </View>
      </Card>

      {/* Category Breakdown Donut */}
      <Card style={styles.sectionCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderTitle}>
            <PieChart size={18} color={theme.colors.primary} />
            <Text style={[styles.cardTitleText, { color: theme.colors.foreground }]}>
              Category Distribution
            </Text>
          </View>
          <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
            {categoryData.length} categories
          </Text>
        </View>

        <DonutChart
          data={categoryData}
          size={190}
          strokeWidth={24}
          currency={system.defaultCurrency}
          title="Total Spent"
        />
      </Card>

      {/* Daily Trajectory Curve */}
      <Card style={styles.sectionCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderTitle}>
            <TrendingUp size={18} color={theme.colors.primary} />
            <Text style={[styles.cardTitleText, { color: theme.colors.foreground }]}>
              Daily Spending Run-Rate
            </Text>
          </View>
        </View>
        <Text style={[styles.cardSubtitleText, { color: theme.colors.mutedForeground }]}>
          Daily trajectory and spikes across {formattedMonthLabel}
        </Text>

        <SpendingCurveChart
          points={dailyPoints}
          height={170}
          currency={system.defaultCurrency}
          lineColor={theme.colors.primary}
        />
      </Card>

      {/* Deep Dive Metrics */}
      <View style={styles.deepMetricsGrid}>
        {/* Weekend vs Weekday Card */}
        <Card style={styles.deepMetricCard}>
          <Text style={[styles.deepMetricTitle, { color: theme.colors.foreground }]}>
            Weekend vs Weekday
          </Text>
          <View style={{ marginVertical: 8 }}>
            <DistributionBar
              segments={[
                {
                  label: "Weekday",
                  value: weekendVsWeekday.weekday,
                  color: theme.colors.primary,
                },
                {
                  label: "Weekend",
                  value: weekendVsWeekday.weekend,
                  color: "#F59E0B",
                },
              ]}
              height={10}
            />
          </View>
          <View style={styles.statSplitRow}>
            <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
              Weekday: <Amount value={weekendVsWeekday.weekday} currency={system.defaultCurrency} />
            </Text>
            <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
              Weekend: <Amount value={weekendVsWeekday.weekend} currency={system.defaultCurrency} />
            </Text>
          </View>
        </Card>

        {/* Day of Week Breakdown Bar Chart */}
        <Card style={styles.deepMetricCard}>
          <Text style={[styles.deepMetricTitle, { color: theme.colors.foreground }]}>
            Spend by Day of Week
          </Text>
          <BarChart
            data={dayOfWeekData}
            height={130}
            currency={system.defaultCurrency}
            primaryColor={theme.colors.primary}
            showLegend={false}
          />
        </Card>
      </View>

      {/* Top Vendors Frequency Card */}
      {topVendors.length > 0 && (
        <Card style={styles.sectionCard}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderTitle}>
              <ShoppingBag size={18} color={theme.colors.primary} />
              <Text style={[styles.cardTitleText, { color: theme.colors.foreground }]}>
                Top Recurring Merchants & Notes
              </Text>
            </View>
          </View>

          <View style={styles.vendorList}>
            {topVendors.map((v, i) => (
              <View
                key={v.note + i}
                style={[
                  styles.vendorRow,
                  { borderBottomColor: theme.colors.border },
                  i === topVendors.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <View style={styles.vendorLeft}>
                  <View
                    style={[
                      styles.rankBadge,
                      {
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(0,0,0,0.04)",
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.mutedForeground }}>
                      #{i + 1}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={[styles.vendorName, { color: theme.colors.foreground }]}
                      numberOfLines={1}
                    >
                      {v.note}
                    </Text>
                    <Text style={{ fontSize: 10, color: theme.colors.mutedForeground }}>
                      {v.count} transaction{v.count > 1 ? "s" : ""}
                    </Text>
                  </View>
                </View>
                <Amount
                  value={v.total}
                  currency={system.defaultCurrency}
                  ghostable
                  style={{ fontSize: 13, fontWeight: "700", color: theme.colors.foreground }}
                />
              </View>
            ))}
          </View>
        </Card>
      )}

      {/* Anomalies Outlier Callout */}
      {anomalies.length > 0 && (
        <Card style={styles.sectionCard}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderTitle}>
              <Flame size={18} color="#EF4444" />
              <Text style={[styles.cardTitleText, { color: theme.colors.foreground }]}>
                High-Ticket Outliers
              </Text>
            </View>
            <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
              &gt;2x monthly average
            </Text>
          </View>

          <View style={styles.anomalyList}>
            {anomalies.map((item) => (
              <View
                key={item.id}
                style={[
                  styles.anomalyRow,
                  {
                    backgroundColor: isDark
                      ? "rgba(239,68,68,0.08)"
                      : "rgba(239,68,68,0.04)",
                    borderColor: isDark
                      ? "rgba(239,68,68,0.2)"
                      : "rgba(239,68,68,0.15)",
                  },
                ]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={[styles.anomalyTitle, { color: theme.colors.foreground }]}
                    numberOfLines={1}
                  >
                    {item.note || item.category}
                  </Text>
                  <Text style={{ fontSize: 10, color: theme.colors.mutedForeground }}>
                    {item.date} • {item.category}
                  </Text>
                </View>
                <Amount
                  value={item.amount}
                  currency={system.defaultCurrency}
                  ghostable
                  style={{ fontSize: 14, fontWeight: "800", color: "#EF4444" }}
                />
              </View>
            ))}
          </View>
        </Card>
      )}
      </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  monthStrip: {
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
  monthLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  monthLabelText: {
    fontSize: 15,
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
  insightBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  insightIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  insightTitle: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  insightBody: {
    fontSize: 12,
    lineHeight: 16,
  },
  heroCard: {
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
  cardSubtitleText: {
    fontSize: 12,
    marginTop: -8,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  cashflowRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cashflowCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  cashflowLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  cashflowDivider: {
    width: 1,
    height: 32,
  },
  pacingStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  pacingItem: {
    alignItems: "center",
    gap: 2,
  },
  pacingLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
  pacingValue: {
    fontSize: 12,
    fontWeight: "800",
  },
  pacingDotDivider: {
    width: 1,
    height: 24,
  },
  sectionCard: {
    padding: 16,
    gap: 14,
    borderRadius: 20,
  },
  deepMetricsGrid: {
    gap: 14,
  },
  deepMetricCard: {
    padding: 16,
    gap: 8,
    borderRadius: 18,
  },
  deepMetricTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  statSplitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  vendorList: {
    gap: 8,
  },
  vendorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  vendorLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: 8,
    minWidth: 0,
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  vendorName: {
    fontSize: 13,
    fontWeight: "700",
  },
  anomalyList: {
    gap: 8,
  },
  anomalyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  anomalyTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
});
