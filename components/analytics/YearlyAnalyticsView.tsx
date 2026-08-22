import React, {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  PiggyBank,
  Receipt,
} from "lucide-react-native";

import {
  AnnualOverviewCard,
  type AnnualMetric,
} from "@/components/analytics/yearly/AnnualOverviewCard";
import { BiggestTransactionCard } from "@/components/analytics/yearly/BiggestTransactionCard";
import {
  IncomeVsSpendCard,
  type MonthHighlight,
} from "@/components/analytics/yearly/IncomeVsSpendCard";
import {
  YearlyInsightGrid,
  useYearlyTileTextStyles,
  type YearlyInsightTile,
} from "@/components/analytics/yearly/YearlyInsightGrid";
import { CategoryDistributionCard } from "@/components/analytics/shared/CategoryDistributionCard";
import { PeriodSelector } from "@/components/analytics/shared/PeriodSelector";
import { insightAccents } from "@/components/analytics/insightsTheme";
import { Amount } from "@/components/common/Amount";
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
import { useModals } from "@/providers/ModalProvider";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { groupByCategory } from "@/shared/utils/analytics";
import { COLORS } from "@/shared/utils/chartColors";
import type { BarChartItem } from "@/components/charts/BarChart";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/** Ordered vertical structure of the yearly dashboard. */
type SectionKey =
  | "overview"
  | "monthly"
  | "distribution"
  | "biggest"
  | "insights";

const ALL_SECTIONS: SectionKey[] = [
  "overview",
  "monthly",
  "distribution",
  "biggest",
  "insights",
];

/**
 * Signed percentage change. Returns null when the previous period can't
 * support a comparison, so the UI omits the badge instead of inventing one.
 * `Math.abs` on the denominator keeps the sign meaningful for net savings,
 * which can itself be negative.
 */
function percentChange(current: number, previous: number): number | null {
  if (!previous || !Number.isFinite(previous)) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export interface YearlyAnalyticsViewProps {
  /** Screen chrome (page header + tabs) scrolled with the dashboard. */
  listHeader?: ReactNode;
}

export function YearlyAnalyticsView({ listHeader }: YearlyAnalyticsViewProps) {
  const router = useRouter();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const accents = insightAccents(isDark);
  const tileText = useYearlyTileTextStyles();
  const { setEditingExpense } = useModals();

  const {
    expenses,
    loading: expensesLoading,
    error: expensesError,
    retry: retryExpenses,
  } = useExpenses();
  const { incomes } = useIncomes();

  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const currency = useDisplayCurrency();
  const previousYear = selectedYear - 1;

  const handlePrevYear = useCallback(() => {
    void haptic.selection();
    setSelectedYear((year) => year - 1);
  }, []);

  const handleNextYear = useCallback(() => {
    void haptic.selection();
    setSelectedYear((year) => year + 1);
  }, []);

  // Year filtered transactions
  const yearExpenses = useMemo(
    () => expenses.filter((e) => e.date?.startsWith(String(selectedYear))),
    [expenses, selectedYear]
  );
  const yearIncomes = useMemo(
    () => incomes.filter((inc) => inc.date?.startsWith(String(selectedYear))),
    [incomes, selectedYear]
  );

  // Previous year, used only for the year-over-year badges
  const prevYearTotals = useMemo(() => {
    const prefix = String(previousYear);
    const spent = expenses
      .filter((e) => e.date?.startsWith(prefix))
      .reduce((sum, e) => sum + e.amount, 0);
    const income = incomes
      .filter((inc) => inc.date?.startsWith(prefix))
      .reduce((sum, inc) => sum + inc.amount, 0);
    return { spent, income, net: income - spent };
  }, [expenses, incomes, previousYear]);

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
  const savingsRate =
    totalAnnualIncome > 0
      ? Math.round((netAnnualSavings / totalAnnualIncome) * 100)
      : null;

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

  // Peak / lowest months. Only months with activity are candidates, so a
  // year that is still in progress never reports an empty month as "lowest".
  const { peakSpend, lowestSpend, lowestIncome } = useMemo(() => {
    const spendMonths = monthlyChartData.filter((m) => m.value > 0);
    const incomeMonths = monthlyChartData.filter(
      (m) => (m.secondaryValue ?? 0) > 0
    );

    const spendSorted = [...spendMonths].sort((a, b) => b.value - a.value);
    const incomeSorted = [...incomeMonths].sort(
      (a, b) => (a.secondaryValue ?? 0) - (b.secondaryValue ?? 0)
    );

    const toHighlight = (
      item: BarChartItem | undefined,
      key: "value" | "secondaryValue"
    ): MonthHighlight =>
      item ? { label: item.label, value: item[key] ?? 0 } : null;

    return {
      peakSpend: toHighlight(spendSorted[0], "value"),
      lowestSpend: toHighlight(spendSorted[spendSorted.length - 1], "value"),
      lowestIncome: toHighlight(incomeSorted[0], "secondaryValue"),
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

  const overviewMetrics: AnnualMetric[] = useMemo(() => {
    const hasPrevYear = prevYearTotals.spent > 0 || prevYearTotals.income > 0;
    const delta = (current: number, previous: number) => {
      if (!hasPrevYear) return null;
      const percent = percentChange(current, previous);
      return percent === null ? null : { percent, againstYear: previousYear };
    };

    return [
      {
        label: "Total Spent",
        value: totalAnnualExpense,
        color: accents.pink,
        delta: delta(totalAnnualExpense, prevYearTotals.spent),
        riseIsGood: false,
      },
      {
        label: "Total Income",
        value: totalAnnualIncome,
        color: accents.green,
        delta: delta(totalAnnualIncome, prevYearTotals.income),
        riseIsGood: true,
      },
      {
        label: "Net Savings",
        value: netAnnualSavings,
        color: netAnnualSavings >= 0 ? accents.green : accents.pink,
        delta: delta(netAnnualSavings, prevYearTotals.net),
        riseIsGood: true,
      },
      {
        // The delta here would restate Total Spent exactly (both are /12), so
        // the badge is deliberately omitted.
        label: "Monthly Avg",
        value: monthlyAverageExpense,
        color: theme.colors.foreground,
        delta: null,
        riseIsGood: false,
      },
    ];
  }, [
    accents.green,
    accents.pink,
    monthlyAverageExpense,
    netAnnualSavings,
    prevYearTotals,
    previousYear,
    theme.colors.foreground,
    totalAnnualExpense,
    totalAnnualIncome,
  ]);

  const insightTiles: YearlyInsightTile[] = useMemo(() => {
    const tiles: YearlyInsightTile[] = [];

    if (peakSpend) {
      tiles.push({
        id: "highestSpendMonth",
        label: "Highest Spend Month",
        icon: <ArrowUpRight size={15} color={accents.pink} strokeWidth={2.5} />,
        tintRgb: "244, 63, 94",
        value: <Text style={tileText.value}>{peakSpend.label}</Text>,
        sub: (
          <Amount
            value={peakSpend.value}
            currency={currency}
            ghostable
            numberOfLines={1}
            style={tileText.sub}
          />
        ),
      });
    }

    if (lowestSpend) {
      tiles.push({
        id: "lowestSpendMonth",
        label: "Lowest Spend Month",
        icon: <ArrowDownRight size={15} color={accents.green} strokeWidth={2.5} />,
        tintRgb: "74, 222, 128",
        value: <Text style={tileText.value}>{lowestSpend.label}</Text>,
        sub: (
          <Amount
            value={lowestSpend.value}
            currency={currency}
            ghostable
            numberOfLines={1}
            style={tileText.sub}
          />
        ),
      });
    }

    tiles.push({
      id: "avgMonthlySpend",
      label: "Avg Monthly Spend",
      icon: <CalendarClock size={15} color={accents.amber} strokeWidth={2.5} />,
      tintRgb: "251, 191, 36",
      value: (
        <Amount
          value={monthlyAverageExpense}
          currency={currency}
          ghostable
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          style={tileText.value}
        />
      ),
      sub: <Text style={tileText.sub}>across 12 months</Text>,
    });

    if (savingsRate !== null) {
      tiles.push({
        id: "savingsRate",
        label: "Savings Rate",
        icon: (
          <PiggyBank
            size={15}
            color={savingsRate >= 0 ? accents.green : accents.pink}
            strokeWidth={2.5}
          />
        ),
        tintRgb: savingsRate >= 0 ? "74, 222, 128" : "244, 63, 94",
        value: (
          <Text style={savingsRate >= 0 ? tileText.positive : tileText.negative}>
            {savingsRate}%
          </Text>
        ),
        sub: <Text style={tileText.sub}>of annual income</Text>,
      });
    }

    tiles.push({
      id: "transactionCount",
      label: "Transactions Logged",
      icon: <Receipt size={15} color={theme.colors.mutedForeground} strokeWidth={2.5} />,
      tintRgb: "148, 163, 184",
      value: <Text style={tileText.value}>{yearExpenses.length}</Text>,
      sub: (
        <Text style={tileText.sub}>
          {yearIncomes.length} income entr{yearIncomes.length === 1 ? "y" : "ies"}
        </Text>
      ),
    });

    const incomeGrowth = percentChange(totalAnnualIncome, prevYearTotals.income);
    if (incomeGrowth !== null) {
      tiles.push({
        id: "incomeGrowth",
        label: "Income Growth",
        icon:
          incomeGrowth >= 0 ? (
            <ArrowUpRight size={15} color={accents.green} strokeWidth={2.5} />
          ) : (
            <ArrowDownRight size={15} color={accents.pink} strokeWidth={2.5} />
          ),
        tintRgb: incomeGrowth >= 0 ? "74, 222, 128" : "244, 63, 94",
        value: (
          <Text style={incomeGrowth >= 0 ? tileText.positive : tileText.negative}>
            {incomeGrowth > 0 ? "+" : ""}
            {Math.round(incomeGrowth)}%
          </Text>
        ),
        sub: <Text style={tileText.sub}>vs {previousYear}</Text>,
      });
    }

    return tiles;
  }, [
    accents.amber,
    accents.green,
    accents.pink,
    currency,
    lowestSpend,
    monthlyAverageExpense,
    peakSpend,
    prevYearTotals.income,
    previousYear,
    savingsRate,
    theme.colors.mutedForeground,
    tileText,
    totalAnnualIncome,
    yearExpenses.length,
    yearIncomes.length,
  ]);

  // Skip sections with nothing to render so the separators don't leave gaps.
  const sections = useMemo(
    () =>
      ALL_SECTIONS.filter((section) => {
        if (section === "biggest") return biggestExpense !== null;
        if (section === "insights") return insightTiles.length > 0;
        return true;
      }),
    [biggestExpense, insightTiles.length]
  );

  const yearSelector = (
    <PeriodSelector
      label={String(selectedYear)}
      badge={selectedYear === currentYear ? "THIS YEAR" : null}
      onPrev={handlePrevYear}
      onNext={handleNextYear}
      prevLabel="Previous year"
      nextLabel="Next year"
    />
  );

  const renderSection = useCallback(
    ({ item }: { item: SectionKey }) => {
      switch (item) {
        case "overview":
          return (
            <AnnualOverviewCard
              year={selectedYear}
              metrics={overviewMetrics}
              currency={currency}
            />
          );
        case "monthly":
          return (
            <IncomeVsSpendCard
              data={monthlyChartData}
              peakSpend={peakSpend}
              lowestIncome={lowestIncome}
              currency={currency}
            />
          );
        case "distribution":
          return (
            <CategoryDistributionCard
              data={categoryData}
              total={totalAnnualExpense}
              currency={currency}
              title={`${selectedYear} Annual Distribution`}
              centerTitle="Annual Spend"
              emptyMessage={`No spending recorded in ${selectedYear}.`}
            />
          );
        case "biggest":
          if (!biggestExpense) return null;
          return (
            <BiggestTransactionCard
              year={selectedYear}
              title={biggestExpense.note || biggestExpense.category}
              date={biggestExpense.date}
              category={biggestExpense.category}
              amount={biggestExpense.amount}
              currency={currency}
              onPress={() => setEditingExpense(biggestExpense)}
            />
          );
        case "insights":
          return <YearlyInsightGrid tiles={insightTiles} />;
        default:
          return null;
      }
    },
    [
      biggestExpense,
      categoryData,
      currency,
      insightTiles,
      lowestIncome,
      monthlyChartData,
      overviewMetrics,
      peakSpend,
      selectedYear,
      setEditingExpense,
      totalAnnualExpense,
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
        {yearSelector}
        <ErrorState
          title="Couldn't load your yearly analytics"
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
        <Skeleton height={188} borderRadius={22} />
        <Skeleton height={300} borderRadius={22} />
        <Skeleton height={280} borderRadius={22} />
        <Skeleton height={88} borderRadius={20} />
      </>
    );
  }

  if (yearExpenses.length === 0 && yearIncomes.length === 0) {
    return stateShell(
      <>
        {listHeader}
        {yearSelector}
        <EmptyState
          illustration="analytics"
          title={`No financial data for ${selectedYear}`}
          description="Start recording transactions to see your yearly insights — annual totals, month-by-month trends, and category breakdowns."
          primaryAction={{
            label: "Go to Dashboard",
            onPress: () => router.dismissTo("/dashboard"),
          }}
          secondaryAction={{
            label: `View ${previousYear}`,
            onPress: handlePrevYear,
          }}
          tip="Annual breakdowns highlight your top spending categories and your biggest financial events of the year."
        />
      </>
    );
  }

  return (
    <FlashList
      style={styles.list}
      data={sections}
      renderItem={renderSection}
      keyExtractor={(item) => item}
      extraData={`${selectedYear}|${themeName}|${yearExpenses.length}|${totalAnnualExpense}|${totalAnnualIncome}`}
      ItemSeparatorComponent={SectionSeparator}
      ListHeaderComponent={
        <View style={styles.header}>
          {listHeader}
          {yearSelector}
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
