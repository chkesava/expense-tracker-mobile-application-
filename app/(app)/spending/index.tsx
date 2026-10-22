import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ChevronRight, Wallet } from "lucide-react-native";

import { DonutChart } from "@/components/charts/DonutChart";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { MetaLabel, Section, StatTile, TrendText, useSurfaces } from "@/components/dashboard/primitives";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { spendingSliceColor } from "@/components/spending/palette";
import {
  CategoryShareRow,
  DataNote,
  MonthlySpendBars,
  SpendingMonthSelector,
} from "@/components/spending/SpendingParts";
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
import { currentMonthKey } from "@/shared/utils/dates";
import { monthLabel } from "@/shared/utils/monthLabel";
import {
  TOTAL_SPENDING_TABS,
  categorizedSpendTotal,
  categoryDetailHref,
  isFoldedOthersSlice,
  monthlySpendSeries,
  resolveSpendingMonth,
  resolveSpendingTab,
  spendComparison,
  transactionStats,
  uncategorizedSpend,
  type TotalSpendingTab,
} from "@/shared/utils/spendingDrilldown";
import { useTheme } from "@/theme/ThemeProvider";

const TABS = [
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
  const setTab = (next: string) => router.setParams({ tab: next });

  const header = (
    <PageHeader
      title="Total Spending"
      subtitle={monthLabel(month, "long")}
      icon={<Wallet size={22} color={theme.colors.primary} />}
      onBack={goBack}
      rightElement={<SpendingMonthSelector month={month} maxMonth={thisMonth} onChange={setMonth} />}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      tabVariant="underline"
    />
  );

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
          <Section testID="total-spending-hero">
            <MetaLabel>{`Spent in ${monthLabel(month, "long")}`}</MetaLabel>
            <FinancialAmount value={total} currency={currency} size="hero" weight="bold" fit />
            {comparison ? (
              <TrendText
                delta={Math.round(comparison.pct)}
                invert
                suffix={`vs last month (${money(comparison.previous)})`}
              />
            ) : (
              <Text style={[styles.muted, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
                No spending recorded last month to compare with
              </Text>
            )}
          </Section>

          {isFromCache ? <DataNote offline>You're offline — showing the figures saved on this device.</DataNote> : null}
          {uncategorized > 0 ? (
            <DataNote>{`${money(uncategorized)} this month has no category and is not part of this total.`}</DataNote>
          ) : null}

          {tab === "overview" ? (
            <OverviewTab month={month} current={current} total={total} summaries={summaries} currency={currency} comparisonPct={comparison?.pct ?? null} onShowCategories={() => setTab("categories")} />
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
  comparisonPct,
  onShowCategories,
}: {
  month: string;
  current: DashboardPeriodSummary | null;
  total: number;
  summaries: DashboardPeriodSummary[];
  currency: string;
  comparisonPct: number | null;
  onShowCategories: () => void;
}) {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const money = useGhostMoney(currency);
  const { rows, loading: rowsLoading, monthLoaded } = useMonthExpenseRows(month);
  const stats = transactionStats(rows);
  const { categories } = useMemo(() => spendingBreakdown(current?.categoryTotals, BREAKDOWN_LIMIT), [current]);
  const segments = categories.map((c, i) => ({
    id: c.category,
    label: c.category,
    value: c.amount,
    color: spendingSliceColor(i, c.category, theme.colors),
  }));
  const series = useMemo(() => monthlySpendSeries(summaries, month, 6), [summaries, month]);

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
      <Section title="Spending breakdown">
        <View style={styles.breakdown}>
          <DonutChart
            data={segments}
            size={156}
            strokeWidth={22}
            currency={currency}
            title="Total spent"
            titleBelow
            centerFractionDigits={0}
            showLegend={false}
            onSlicePress={(_, index) => openSlice(index)}
          />
          <View style={styles.legend}>
            {categories.map((c, i) => (
              <Pressable
                key={c.category}
                onPress={() => {
                  void haptic.selection();
                  openSlice(i);
                }}
                style={({ pressed }) => [styles.legendRow, pressed && { backgroundColor: surfaces.control }]}
                accessibilityRole="button"
                accessibilityLabel={`${c.category}, ${Math.round(c.percentage)}% of total spending, ${money(c.amount)}. Open details`}
              >
                <View style={[styles.dot, { backgroundColor: segments[i]?.color }]} />
                <Text style={[styles.legendLabel, { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular }]} numberOfLines={1}>
                  {c.category}
                </Text>
                <Text style={[styles.legendPct, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
                  {Math.round(c.percentage)}%
                </Text>
                <FinancialAmount value={c.amount} currency={currency} size="xs" weight="medium" />
                <ChevronRight size={14} color={theme.colors.mutedForeground} />
              </Pressable>
            ))}
          </View>
        </View>
      </Section>

      <View style={styles.tiles}>
        <StatTile label="vs last month" style={styles.tile}>
          {comparisonPct === null ? (
            <Text style={[styles.tileValue, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold }]}>—</Text>
          ) : (
            <TrendText delta={Math.round(comparisonPct)} invert suffix="" />
          )}
        </StatTile>
        <StatTile label="Transactions" style={styles.tile} meta={!monthLoaded && !rowsLoading ? "Loading more…" : undefined}>
          <Text style={[styles.tileValue, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
            {rowsLoading ? "…" : String(stats.count)}
          </Text>
        </StatTile>
        <StatTile label="Average" style={styles.tile}>
          {stats.average === null || rowsLoading ? (
            <Text style={[styles.tileValue, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold }]}>—</Text>
          ) : (
            <FinancialAmount value={stats.average} currency={currency} size="md" weight="semibold" />
          )}
        </StatTile>
      </View>

      <Section title="Monthly spending" subtitle="Last 6 months">
        <MonthlySpendBars series={series} currency={currency} formatMoney={money} />
      </Section>
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
    <Section title="Categories by amount" subtitle="Share of total spending this month">
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
    </Section>
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
  const { rows, loading, monthLoaded } = useMonthExpenseRows(month);
  const options = useMemo(
    () =>
      topCategoryShares(current?.categoryTotals, Number.MAX_SAFE_INTEGER).categories.map((c) => ({
        value: c.category,
        label: c.category,
      })),
    [current]
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

      <Section title="Monthly spending" subtitle={`Last ${range === 12 ? "12 months" : `${range} months`}`}>
        <MonthlySpendBars series={series} currency={currency} formatMoney={money} />
      </Section>

      {withData.length < 2 ? (
        <DataNote>Not enough history yet — comparisons appear once two or more months have spending.</DataNote>
      ) : (
        <View style={styles.tiles}>
          <StatTile label="Monthly average" style={styles.tile} meta={vsAverage ? <TrendText delta={Math.round(vsAverage.pct)} invert suffix="this month" /> : undefined}>
            <FinancialAmount value={average ?? 0} currency={currency} size="md" weight="semibold" />
          </StatTile>
          <StatTile label="Highest" style={styles.tile} meta={highest ? <Text style={[styles.tileMeta, muted]}>{monthLabel(highest.month)}</Text> : undefined}>
            <FinancialAmount value={highest?.amount ?? 0} currency={currency} size="md" weight="semibold" />
          </StatTile>
          <StatTile label="Lowest" style={styles.tile} meta={lowest ? <Text style={[styles.tileMeta, muted]}>{monthLabel(lowest.month)}</Text> : undefined}>
            <FinancialAmount value={lowest?.amount ?? 0} currency={currency} size="md" weight="semibold" />
          </StatTile>
        </View>
      )}

      <Section title="Same month last year">
        {vsLastYear ? (
          <>
            <FinancialAmount value={vsLastYear.previous} currency={currency} size="lg" weight="semibold" />
            <TrendText delta={Math.round(vsLastYear.pct)} invert suffix={`this month vs ${monthLabel(lastYear.month)}`} />
          </>
        ) : (
          <Text style={[styles.muted, muted]}>{`No spending recorded in ${monthLabel(lastYear?.month ?? month, "long")} to compare with.`}</Text>
        )}
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  muted: { fontSize: 13, lineHeight: 18 },
  breakdown: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 14 },
  legend: { flex: 1, minWidth: 200, gap: 2 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40, paddingHorizontal: 6, borderRadius: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: 13.5 },
  legendPct: { fontSize: 12.5, fontVariant: ["tabular-nums"] },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { flexGrow: 1, flexBasis: 100 },
  tileValue: { fontSize: 18 },
  tileMeta: { fontSize: 12 },
  ranges: { flexDirection: "row", gap: 8 },
});
