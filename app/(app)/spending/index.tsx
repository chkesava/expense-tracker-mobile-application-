import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Wallet } from "lucide-react-native";

import { DonutChart } from "@/components/charts/DonutChart";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { TrendText, useSurfaces, withAlpha } from "@/components/dashboard/primitives";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { spendingSliceColor } from "@/components/spending/palette";
import {
  BreakdownCard,
  CalloutCard,
  CategoryShareRow,
  DataNote,
  DrilldownTabs,
  DrilldownTopBar,
  MonthlySpendBars,
  SpendingHero,
  SurfaceCard,
  TrendChip,
} from "@/components/spending/SpendingParts";
import { SpendingTrendPanel, TransactionComparisonCards } from "@/components/spending/SpendingTrendPanel";
import { SpendingTransactionList } from "@/components/spending/SpendingTransactionList";
import { Chip } from "@/components/ui/Chip";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useExpenses } from "@/hooks/useExpenses";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useMonthExpenseRows, useSpendingSummaries } from "@/hooks/useSpendingDrilldown";
import { haptic } from "@/lib/haptics";
import { useGlobalMonth } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import type { DashboardPeriodSummary } from "@/shared/types/financialSummary";
import { spendingBreakdown, topCategoryShares } from "@/shared/utils/dashboardWidgets";
import { currentMonthKey, shiftMonthKey } from "@/shared/utils/dates";
import { monthLabel } from "@/shared/utils/monthLabel";
import {
  TOTAL_SPENDING_TABS,
  categorizedSpendTotal,
  comparisonCallout,
  categoryDetailHref,
  isFoldedOthersSlice,
  monthlySpendSeries,
  resolveSpendingMonth,
  resolveSpendingTab,
  spendComparison,
  uncategorizedSpend,
  type TotalSpendingTab,
} from "@/shared/utils/spendingDrilldown";
import { useTheme } from "@/theme/ThemeProvider";

const TABS: Array<{ id: TotalSpendingTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "categories", label: "Categories" },
  { id: "transactions", label: "Transactions" },
  { id: "trends", label: "Trends" },
];

const BREAKDOWN_LIMIT = 5;
const TREND_RANGES = [3, 6, 12] as const;
type TrendRange = (typeof TREND_RANGES)[number];

/**
 * SPENDLY-574 — Total Spending, opened from the dashboard donut's centre. The
 * headline is the donut's own figure (the month's parent-category totals from
 * the `dashboard_{YYYY-MM}` summary), so the two always agree. Month and tab
 * live in the route params: they survive tab switches, category drill-downs
 * and back navigation.
 */
export default function TotalSpendingScreen() {
  const params = useLocalSearchParams<{ month?: string; tab?: string; range?: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();
  const { globalMonth } = useGlobalMonth();
  const currency = useDisplayCurrency();
  const money = useGhostMoney(currency);
  const { isFromCache } = useExpenses();

  const thisMonth = currentMonthKey(settings.timezone);
  const month = resolveSpendingMonth(params.month, globalMonth || thisMonth);
  const tab = resolveSpendingTab(params.tab, TOTAL_SPENDING_TABS, "overview");
  const range: TrendRange = TREND_RANGES.find((r) => String(r) === params.range) ?? 6;
  // Trends needs a year back plus one month for the year-on-year figure.
  const windowSize = tab === "trends" ? 13 : 6;
  const { summaries, current, previous, loading, error } = useSpendingSummaries(month, windowSize);

  const total = categorizedSpendTotal(current?.categoryTotals);
  const comparison = spendComparison(total, previous ? categorizedSpendTotal(previous.categoryTotals) : null);
  const uncategorized = uncategorizedSpend(current);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/dashboard" as Href));
  const setMonth = (next: string) => router.setParams({ month: next });
  const setTab = (next: TotalSpendingTab) => router.setParams({ tab: next });

  const header = <DrilldownTopBar onBack={goBack} month={month} maxMonth={thisMonth} onChangeMonth={setMonth} />;

  if (error && !current) {
    return (
      <PageShell contentContainerStyle={styles.content}>
        {header}
        <ErrorState title="Couldn't load your spending" description={error.message} />
      </PageShell>
    );
  }

  return (
    <PageShell contentContainerStyle={styles.content}>
      {header}

      {loading ? (
        <>
          <DashboardSkeleton variant="hero" />
          <DashboardSkeleton variant="section" rows={4} />
        </>
      ) : (
        <>
          <SpendingHero
            testID="total-spending-hero"
            icon={
              <View style={[styles.heroIcon, { backgroundColor: withAlpha(theme.colors.primary, surfaces.isDark ? 0.18 : 0.1) }]}>
                <Wallet size={24} color={theme.colors.primary} strokeWidth={2} />
              </View>
            }
            title="Total Spending"
            caption={total > 0 ? `All categories · ${monthLabel(month)}` : `Nothing spent · ${monthLabel(month)}`}
            amount={total}
            currency={currency}
            change={comparison}
            previousLabel={comparison ? `${money(comparison.previous)} last month` : undefined}
          />

          <DrilldownTabs tabs={TABS} value={tab} onChange={setTab} />

          {isFromCache ? <DataNote offline>You're offline — showing the figures saved on this device.</DataNote> : null}
          {uncategorized > 0 ? (
            <DataNote>{`${money(uncategorized)} this month has no category and is not part of this total.`}</DataNote>
          ) : null}

          {tab === "overview" ? (
            <OverviewTab
              month={month}
              current={current}
              total={total}
              summaries={summaries}
              currency={currency}
              callout={comparisonCallout("Your", total, comparison?.previous, monthLabel(shiftMonthKey(month, -1), "long"))}
              onShowCategories={() => setTab("categories")}
              onShowTrends={() => setTab("trends")}
            />
          ) : tab === "categories" ? (
            <CategoriesTab month={month} current={current} currency={currency} />
          ) : tab === "transactions" ? (
            <TransactionsTab month={month} current={current} total={total} currency={currency} />
          ) : (
            <TrendsTab
              month={month}
              summaries={summaries}
              range={range}
              onRange={(r) => router.setParams({ range: String(r) })}
              currency={currency}
            />
          )}
        </>
      )}
    </PageShell>
  );
}

function OverviewTab({
  month,
  current,
  total,
  summaries,
  currency,
  callout,
  onShowCategories,
  onShowTrends,
}: {
  month: string;
  current: DashboardPeriodSummary | null;
  total: number;
  summaries: DashboardPeriodSummary[];
  currency: string;
  callout: ReturnType<typeof comparisonCallout>;
  onShowCategories: () => void;
  onShowTrends: () => void;
}) {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const money = useGhostMoney(currency);
  const { categories } = useMemo(() => spendingBreakdown(current?.categoryTotals, BREAKDOWN_LIMIT), [current]);
  const segments = categories.map((c, i) => ({
    id: c.category,
    label: c.category,
    value: c.amount,
    color: spendingSliceColor(i, c.category, theme.colors),
  }));

  const openSlice = (index: number) => {
    const slice = categories[index];
    if (!slice) return;
    if (isFoldedOthersSlice(categories, index, current?.categoryTotals, BREAKDOWN_LIMIT)) onShowCategories();
    else router.push(categoryDetailHref(slice.category, month) as Href);
  };

  if (total <= 0) {
    return (
      <EmptyState
        illustration="analytics"
        title={`No spending in ${monthLabel(month, "long")}`}
        description="Expenses you record for this month will be broken down here."
      />
    );
  }

  return (
    <>
      <BreakdownCard
        title="Breakdown"
        items={categories.map((c, i) => ({
          key: c.category,
          label: c.category,
          amount: c.amount,
          percentage: c.percentage,
          color: segments[i]?.color ?? theme.colors.primary,
        }))}
        currency={currency}
        formatMoney={money}
        shareOf="of total spending"
        onPick={openSlice}
      />

      <SpendingTrendPanel summaries={summaries} month={month} currency={currency} />

      <TransactionComparisonCards month={month} currency={currency} />

      {callout ? <CalloutCard title={callout.title} body={callout.body} onPress={onShowTrends} /> : null}
    </>
  );
}

function CategoriesTab({
  month,
  current,
  currency,
}: {
  month: string;
  current: DashboardPeriodSummary | null;
  currency: string;
}) {
  const router = useRouter();
  const { theme } = useTheme();
  const { categories } = useMemo(
    () => topCategoryShares(current?.categoryTotals, Number.MAX_SAFE_INTEGER),
    [current]
  );
  if (categories.length === 0) {
    return (
      <EmptyState
        illustration="analytics"
        title={`No spending in ${monthLabel(month, "long")}`}
        description="Categories appear here, largest first, as you record expenses."
      />
    );
  }
  return (
    <SurfaceCard title="Categories by amount" meta={`${categories.length} categories`}>
      {categories.map((c, i) => (
        <CategoryShareRow
          key={c.category}
          label={c.category}
          amount={c.amount}
          percentage={c.percentage}
          percentageOf="total spending"
          color={spendingSliceColor(i, c.category, theme.colors, "")}
          currency={currency}
          divider={i < categories.length - 1}
          onPress={() => router.push(categoryDetailHref(c.category, month) as Href)}
        />
      ))}
    </SurfaceCard>
  );
}

function TransactionsTab({
  month,
  current,
  total,
  currency,
}: {
  month: string;
  current: DashboardPeriodSummary | null;
  total: number;
  currency: string;
}) {
  const { theme } = useTheme();
  const { rows, loading, monthLoaded } = useMonthExpenseRows(month);
  const options = useMemo(
    () =>
      topCategoryShares(current?.categoryTotals, Number.MAX_SAFE_INTEGER).categories.map((c, i) => ({
        value: c.category,
        label: c.category,
        color: spendingSliceColor(i, c.category, theme.colors, ""),
      })),
    [current, theme.colors]
  );
  return (
    <SpendingTransactionList
      rows={rows}
      loading={loading}
      monthLoaded={monthLoaded}
      summaryTotal={total}
      currency={currency}
      filterLabel="Category"
      filterOptions={options}
      filterKey="category"
      emptyTitle={`No expenses in ${monthLabel(month, "long")}`}
    />
  );
}

function TrendsTab({
  month,
  summaries,
  range,
  onRange,
  currency,
}: {
  month: string;
  summaries: DashboardPeriodSummary[];
  range: TrendRange;
  onRange: (range: TrendRange) => void;
  currency: string;
}) {
  const { theme } = useTheme();
  const money = useGhostMoney(currency);
  const series = useMemo(() => monthlySpendSeries(summaries, month, range), [summaries, month, range]);
  const yearSeries = useMemo(() => monthlySpendSeries(summaries, month, 13), [summaries, month]);
  const withData = series.filter((p) => p.hasData && p.amount > 0);
  const current = series[series.length - 1];
  const average = withData.length > 0 ? withData.reduce((s, p) => s + p.amount, 0) / withData.length : null;
  const highest = withData.length > 0 ? withData.reduce((m, p) => (p.amount > m.amount ? p : m)) : null;
  const lowest = withData.length > 0 ? withData.reduce((m, p) => (p.amount < m.amount ? p : m)) : null;
  const lastYear = yearSeries[0];
  const vsLastYear = lastYear?.hasData ? spendComparison(current?.amount ?? 0, lastYear.amount) : null;
  const vsAverage = average !== null && withData.length >= 2 ? spendComparison(current?.amount ?? 0, average) : null;
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular };

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ranges} accessibilityRole="tablist">
        {TREND_RANGES.map((r) => (
          <Chip
            key={r}
            label={r === 12 ? "1 year" : `${r} months`}
            selected={range === r}
            appearance="outline"
            accessibilityRole="tab"
            onPress={() => onRange(r)}
          />
        ))}
      </ScrollView>

      <SurfaceCard title="Monthly spending" meta={`Last ${range === 12 ? "12 months" : `${range} months`}`}>
        <MonthlySpendBars series={series} currency={currency} formatMoney={money} />
      </SurfaceCard>

      {withData.length < 2 ? (
        <DataNote>Not enough history yet — comparisons appear once two or more months have spending.</DataNote>
      ) : (
        <SurfaceCard title="Summary">
          <View style={styles.summaryRow}>
            {[
              {
                label: "Average",
                amount: average ?? 0,
                meta: vsAverage ? <TrendChip change={vsAverage} subject="This month vs average" /> : null,
              },
              { label: "Highest", amount: highest?.amount ?? 0, meta: highest ? monthLabel(highest.month) : "" },
              { label: "Lowest", amount: lowest?.amount ?? 0, meta: lowest ? monthLabel(lowest.month) : "" },
            ].map((cell, i) => (
              <View
                key={cell.label}
                style={[styles.summaryCell, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: theme.colors.border }]}
              >
                <Text style={[styles.summaryLabel, muted]}>{cell.label}</Text>
                <FinancialAmount value={cell.amount} currency={currency} size="md" weight="bold" fit />
                {typeof cell.meta === "string" ? <Text style={[styles.tileMeta, muted]}>{cell.meta}</Text> : cell.meta}
              </View>
            ))}
          </View>
        </SurfaceCard>
      )}

      <SurfaceCard title="Same month last year">
        {vsLastYear ? (
          <>
            <FinancialAmount value={vsLastYear.previous} currency={currency} size="lg" weight="semibold" />
            <TrendText delta={Math.round(vsLastYear.pct)} invert suffix={`this month vs ${monthLabel(lastYear.month)}`} />
          </>
        ) : (
          <Text style={[styles.muted, muted]}>{`No spending recorded in ${monthLabel(lastYear?.month ?? month, "long")} to compare with.`}</Text>
        )}
      </SurfaceCard>
    </>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: "row" },
  summaryCell: { flex: 1, gap: 4, paddingHorizontal: 10, alignItems: "flex-start" },
  summaryLabel: { fontSize: 12.5 },
  heroIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  content: { gap: 14 },
  muted: { fontSize: 13, lineHeight: 18 },
  breakdown: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 14 },
  legend: { flex: 1, minWidth: 150, gap: 0 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 4, borderRadius: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: 12.5 },
  legendPct: { fontSize: 12.5, fontVariant: ["tabular-nums"] },
  tileMeta: { fontSize: 12 },
  ranges: { flexDirection: "row", gap: 8 },
});
