import React, {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";

import { CashFlowCard } from "@/components/analytics/monthly/CashFlowCard";
import { CategoryDistributionCard } from "@/components/analytics/monthly/CategoryDistributionCard";
import { DailySpendingCard } from "@/components/analytics/monthly/DailySpendingCard";
import { DayOfWeekCard } from "@/components/analytics/monthly/DayOfWeekCard";
import { HighTicketOutliersCard } from "@/components/analytics/monthly/HighTicketOutliersCard";
import { InsightAlertCard } from "@/components/analytics/monthly/InsightAlertCard";
import { MonthSelector } from "@/components/analytics/monthly/MonthSelector";
import { RecurringMerchantsCard } from "@/components/analytics/monthly/RecurringMerchantsCard";
import { WeekendWeekdayCard } from "@/components/analytics/monthly/WeekendWeekdayCard";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { Skeleton } from "@/components/common/Skeleton";
import {
  BOTTOM_NAV_CONTENT_CLEARANCE,
  BOTTOM_NAV_FAB_GAP,
  BOTTOM_NAV_FAB_SIZE,
} from "@/components/layout/chrome";
import { haptic } from "@/lib/haptics";
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

/** Ordered vertical structure of the analytics dashboard. */
type SectionKey =
  | "alert"
  | "cashflow"
  | "categories"
  | "daily"
  | "weekend"
  | "dayOfWeek"
  | "merchants"
  | "outliers";

const SECTIONS: SectionKey[] = [
  "alert",
  "cashflow",
  "categories",
  "daily",
  "weekend",
  "dayOfWeek",
  "merchants",
  "outliers",
];

/** Shifts a "YYYY-MM" key by a whole number of months. */
function shiftMonthKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export interface MonthlyAnalyticsViewProps {
  /** Screen chrome (page header + tabs) scrolled with the dashboard. */
  listHeader?: ReactNode;
}

export function MonthlyAnalyticsView({ listHeader }: MonthlyAnalyticsViewProps) {
  const router = useRouter();
  const { themeName } = useTheme();
  const { settings: userSettings } = useSettings();
  const { settings: system } = useSystemSettings();

  const {
    expenses,
    loading: expensesLoading,
    error: expensesError,
    retry: retryExpenses,
  } = useExpenses();
  const { incomes } = useIncomes();

  // Current month state "YYYY-MM"
  const currentMonthStr = useMemo(() => currentMonthKey(), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);

  const currency = system.defaultCurrency;
  const monthlyBudget = userSettings.monthlyBudget || 0;

  // Month navigation
  const handlePrevMonth = useCallback(() => {
    void haptic.selection();
    setSelectedMonth((prev) => shiftMonthKey(prev, -1));
  }, []);

  const handleNextMonth = useCallback(() => {
    void haptic.selection();
    setSelectedMonth((prev) => shiftMonthKey(prev, 1));
  }, []);

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
  const savingsRate =
    totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;

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

  /** Category colour lookup so merchant rows match the donut palette. */
  const categoryColors = useMemo(() => {
    const map = new Map<string, string>();
    categoryData.forEach((item) => map.set(item.label, item.color));
    return map;
  }, [categoryData]);

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

  const topVendors = useMemo(() => {
    const vendors = getTopVendors(monthExpenses).slice(0, 5);

    // Attach each merchant's dominant category so the row can carry its glyph
    // and palette colour. Presentation only — the totals stay untouched.
    return vendors.map((vendor) => {
      const totalsByCategory = new Map<string, number>();
      monthExpenses.forEach((expense) => {
        const note = expense.note?.trim() || "No Note";
        if (note !== vendor.note) return;
        totalsByCategory.set(
          expense.category,
          (totalsByCategory.get(expense.category) || 0) + expense.amount
        );
      });
      const dominant = Array.from(totalsByCategory.entries()).sort(
        (a, b) => b[1] - a[1]
      )[0];
      const category = dominant?.[0] ?? "";

      return {
        note: vendor.note,
        count: vendor.count,
        total: vendor.total,
        icon: category ? getCategoryIcon(category) : "\u{1F9FE}",
        color: categoryColors.get(category) ?? COLORS[0],
      };
    });
  }, [monthExpenses, categoryColors]);

  const outliers = useMemo(
    () =>
      getAnomalies(monthExpenses).map((item, index) => ({
        id: item.id ?? `outlier-${index}-${item.date}-${item.amount}`,
        title: item.note || item.category,
        date: item.date,
        category: item.category,
        amount: item.amount,
      })),
    [monthExpenses]
  );

  const dayOfWeekData = useMemo(() => {
    const dist = getDayOfWeekDistribution(monthExpenses);
    return dist.map((d) => ({ label: d.name, value: d.amount }));
  }, [monthExpenses]);

  const peakDay = useMemo(() => {
    const best = [...dayOfWeekData].sort((a, b) => b.value - a.value)[0];
    return best && best.value > 0 ? best.label : null;
  }, [dayOfWeekData]);

  const monthSelector = (
    <MonthSelector
      label={formattedMonthLabel}
      isCurrent={selectedMonth === currentMonthStr}
      onPrev={handlePrevMonth}
      onNext={handleNextMonth}
    />
  );

  const renderSection = useCallback(
    ({ item }: { item: SectionKey }) => {
      switch (item) {
        case "alert":
          return (
            <InsightAlertCard
              type={smartInsight.type}
              message={smartInsight.message}
              onPress={
                monthlyBudget > 0
                  ? undefined
                  : () => router.push("/settings/money")
              }
            />
          );
        case "cashflow":
          return (
            <CashFlowCard
              income={totalIncome}
              expenses={totalExpense}
              netSaved={netSavings}
              savingsRate={savingsRate}
              projectedEndOfMonth={pacing.projectedEndMonthTotal}
              pacingPercentage={pacing.pacingPercentage}
              monthlyBudget={monthlyBudget}
              currency={currency}
            />
          );
        case "categories":
          return (
            <CategoryDistributionCard
              data={categoryData}
              total={totalExpense}
              currency={currency}
            />
          );
        case "daily":
          return (
            <DailySpendingCard
              points={dailyPoints}
              monthLabel={formattedMonthLabel}
              currency={currency}
            />
          );
        case "weekend":
          return (
            <WeekendWeekdayCard
              weekday={weekendVsWeekday.weekday}
              weekend={weekendVsWeekday.weekend}
              currency={currency}
            />
          );
        case "dayOfWeek":
          return (
            <DayOfWeekCard
              data={dayOfWeekData}
              peakDay={peakDay}
              currency={currency}
            />
          );
        case "merchants":
          return (
            <RecurringMerchantsCard merchants={topVendors} currency={currency} />
          );
        case "outliers":
          return <HighTicketOutliersCard outliers={outliers} currency={currency} />;
        default:
          return null;
      }
    },
    [
      categoryData,
      currency,
      dailyPoints,
      dayOfWeekData,
      formattedMonthLabel,
      monthlyBudget,
      netSavings,
      outliers,
      pacing,
      peakDay,
      router,
      savingsRate,
      smartInsight,
      topVendors,
      totalExpense,
      totalIncome,
      weekendVsWeekday,
    ]
  );

  /** Non-list states still need to scroll on short screens. */
  const stateShell = (children: ReactNode) => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.stateWrap}
    >
      {children}
    </ScrollView>
  );

  // Listener failure — never fall through to an empty state that implies "no data".
  if (expensesError && expenses.length === 0) {
    return stateShell(
      <>
        {listHeader}
        {monthSelector}
        <ErrorState
          title="Couldn't load your analytics"
          description={expensesError.message}
          onRetry={expensesError.retryable ? retryExpenses : undefined}
        />
      </>
    );
  }

  if (expensesLoading && expenses.length === 0) {
    return stateShell(
      <>
        {listHeader}
        <Skeleton height={56} borderRadius={18} />
        <Skeleton height={78} borderRadius={20} />
        <Skeleton height={152} borderRadius={22} />
        <Skeleton height={280} borderRadius={22} />
        <Skeleton height={220} borderRadius={22} />
      </>
    );
  }

  if (monthExpenses.length === 0) {
    return stateShell(
      <>
        {listHeader}
        {monthSelector}
        <EmptyState
          illustration="analytics"
          title="No Data For This Month"
          description="Log a few expenses or incomes in this month to generate category breakdowns, spending velocity, and cash flow trends."
          primaryAction={{
            label: "Log Expense",
            icon: <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />,
            onPress: () => router.dismissTo("/dashboard"),
          }}
          secondaryAction={{
            label: "Previous Month",
            onPress: handlePrevMonth,
          }}
          tip="Analytics become significantly more actionable once you log at least 5 transactions in a month."
        />
      </>
    );
  }

  return (
    <FlashList
      style={styles.list}
      data={SECTIONS}
      renderItem={renderSection}
      keyExtractor={(item) => item}
      extraData={`${selectedMonth}|${themeName}|${monthExpenses.length}|${totalExpense}|${totalIncome}`}
      ItemSeparatorComponent={SectionSeparator}
      ListHeaderComponent={
        <View style={styles.header}>
          {listHeader}
          {monthSelector}
        </View>
      }
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
    />
  );
}

function SectionSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: 14,
  },
  separator: {
    height: 14,
  },
  list: {
    flex: 1,
  },
  listContent: {
    // PageShell already clears the nav bar; this only clears the floating
    // add button so the last card is never hidden behind it.
    paddingBottom:
      BOTTOM_NAV_FAB_SIZE + BOTTOM_NAV_FAB_GAP - BOTTOM_NAV_CONTENT_CLEARANCE,
  },
  stateWrap: {
    gap: 14,
    paddingBottom:
      BOTTOM_NAV_FAB_SIZE + BOTTOM_NAV_FAB_GAP - BOTTOM_NAV_CONTENT_CLEARANCE,
  },
});
