import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ChevronRight, Lightbulb, TrendingDown, TrendingUp } from "lucide-react-native";

import { BarChart } from "@/components/charts/BarChart";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { RowGlyph, useSurfaces, withAlpha } from "@/components/dashboard/primitives";
import { PageShell } from "@/components/layout/PageShell";
import { spendingSliceColor } from "@/components/spending/palette";
import {
  BreakdownCard,
  CategoryIcon,
  DataNote,
  DrilldownTabs,
  DrilldownTopBar,
  SpendingHero,
  SurfaceCard,
  TrendChip,
} from "@/components/spending/SpendingParts";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useExpenses } from "@/hooks/useExpenses";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useMonthExpenseRows, useSpendingSummaries } from "@/hooks/useSpendingDrilldown";
import { haptic } from "@/lib/haptics";
import { useGlobalMonth } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import type { DashboardPeriodSummary } from "@/shared/types/financialSummary";
import { spendingBreakdown } from "@/shared/utils/dashboardWidgets";
import { currentMonthKey, shiftMonthKey, todayDateKey } from "@/shared/utils/dates";
import { monthLabel } from "@/shared/utils/monthLabel";
import {
  MIN_HISTORY_MONTHS,
  categorizedSpendTotal,
  categoryDetailHref,
  isFoldedOthersSlice,
  monthlySpendSeries,
  resolveSpendingMonth,
  resolveSpendingTab,
  spendComparison,
} from "@/shared/utils/spendingDrilldown";
import {
  TREND_GRANULARITIES,
  TRENDS_TABS,
  categoryMovements,
  dailySeries,
  monthlyTrend,
  seriesStats,
  summaryWindowFor,
  trendInsights,
  weeklySeries,
  yearlyTrend,
  type TrendGranularity,
  type TrendPoint,
  type TrendsTab,
} from "@/shared/utils/spendingTrends";
import { useTheme } from "@/theme/ThemeProvider";

const TABS: Array<{ id: TrendsTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "categories", label: "Categories" },
  { id: "comparison", label: "Compare" },
  { id: "insights", label: "Insights" },
];

const GRANULARITY_OPTIONS = [
  { value: "daily" as const, label: "Daily" },
  { value: "weekly" as const, label: "Weekly" },
  { value: "monthly" as const, label: "Monthly" },
  { value: "yearly" as const, label: "Yearly" },
];

const BREAKDOWN_LIMIT = 5;

/**
 * SPENDLY-578 — Spending Trends, opened from the dashboard's Spending trend
 * row. Monthly and yearly points come from the same `dashboard_{YYYY-MM}`
 * summaries as the dashboard (one bounded window); daily and weekly split the
 * selected month's ledger rows under the summary's own rule. A category opens
 * the SPENDLY-574 category page rather than a second category screen. Month,
 * granularity and tab live in the route.
 */
export default function SpendingTrendsScreen() {
  const params = useLocalSearchParams<{ month?: string; tab?: string; gran?: string }>();
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
  const tab = resolveSpendingTab(params.tab, TRENDS_TABS, "overview");
  const granularity = resolveSpendingTab(params.gran, TREND_GRANULARITIES, "monthly");
  const { summaries, current, previous, loading, error } = useSpendingSummaries(month, summaryWindowFor(granularity));

  const total = categorizedSpendTotal(current?.categoryTotals);
  const change = spendComparison(total, previous ? categorizedSpendTotal(previous.categoryTotals) : null);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/dashboard" as Href));
  const setMonth = (next: string) => router.setParams({ month: next });
  const setTab = (next: TrendsTab) => router.setParams({ tab: next });
  const setGranularity = (next: TrendGranularity) => router.setParams({ gran: next });
  const openCategory = (category: string) => router.push(categoryDetailHref(category, month) as Href);

  const header = <DrilldownTopBar onBack={goBack} month={month} maxMonth={thisMonth} onChangeMonth={setMonth} />;

  if (error && !current) {
    return (
      <PageShell contentContainerStyle={styles.content}>
        {header}
        <ErrorState title="Couldn't load your spending trends" description={error.message} />
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
            testID="trends-hero"
            icon={
              <View style={[styles.heroIcon, { backgroundColor: withAlpha(theme.colors.primary, surfaces.isDark ? 0.18 : 0.1) }]}>
                <TrendingUp size={24} color={theme.colors.primary} strokeWidth={2} />
              </View>
            }
            title="Spending Trends"
            caption={`How your spending moves · ${monthLabel(month)}`}
            amount={total}
            currency={currency}
            change={change}
            previousLabel={change ? `${money(change.previous)} last month` : undefined}
          />

          {isFromCache ? <DataNote offline>You're offline — showing the figures saved on this device.</DataNote> : null}

          <DrilldownTabs tabs={TABS} value={tab} onChange={setTab} />

          {tab === "overview" ? (
            <OverviewTab
              month={month}
              granularity={granularity}
              onGranularity={setGranularity}
              summaries={summaries}
              current={current}
              currency={currency}
              onCategory={openCategory}
              onShowCategories={() => setTab("categories")}
            />
          ) : tab === "categories" ? (
            <CategoriesTab month={month} current={current} previous={previous} currency={currency} onCategory={openCategory} />
          ) : tab === "comparison" ? (
            <ComparisonTab month={month} summaries={summaries} total={total} currency={currency} />
          ) : (
            <InsightsTab month={month} summaries={summaries} />
          )}
        </>
      )}
    </PageShell>
  );
}

/* ----------------------------------------------------------------- Overview */

function OverviewTab({
  month,
  granularity,
  onGranularity,
  summaries,
  current,
  currency,
  onCategory,
  onShowCategories,
}: {
  month: string;
  granularity: TrendGranularity;
  onGranularity: (g: TrendGranularity) => void;
  summaries: DashboardPeriodSummary[];
  current: DashboardPeriodSummary | null;
  currency: string;
  onCategory: (category: string) => void;
  onShowCategories: () => void;
}) {
  const { theme } = useTheme();
  const money = useGhostMoney(currency);
  const { categories } = useMemo(() => spendingBreakdown(current?.categoryTotals, BREAKDOWN_LIMIT), [current]);

  return (
    <>
      <SegmentedControl options={GRANULARITY_OPTIONS} value={granularity} onChange={onGranularity} testID="trends-granularity" />
      {granularity === "daily" || granularity === "weekly" ? (
        <LedgerTrend month={month} granularity={granularity} currency={currency} />
      ) : (
        <TrendCard
          points={granularity === "monthly" ? monthlyTrend(summaries, month, 6) : yearlyTrend(summaries, month, 3)}
          title={granularity === "monthly" ? "Monthly spending" : "Yearly spending"}
          meta={granularity === "monthly" ? "Last 6 months" : "Last 3 years"}
          currency={currency}
          unit={granularity === "monthly" ? "month" : "year"}
        />
      )}

      {categories.length > 0 ? (
        <BreakdownCard
          title={`Breakdown · ${monthLabel(month)}`}
          items={categories.map((c, i) => ({
            key: c.category,
            label: c.category,
            amount: c.amount,
            percentage: c.percentage,
            color: spendingSliceColor(i, c.category, theme.colors),
          }))}
          currency={currency}
          formatMoney={money}
          shareOf="of total spending"
          onPick={(index) => {
            const c = categories[index];
            if (!c) return;
            if (isFoldedOthersSlice(categories, index, current?.categoryTotals, BREAKDOWN_LIMIT)) onShowCategories();
            else onCategory(c.category);
          }}
        />
      ) : null}
    </>
  );
}

/** Daily or weekly points for the selected month, from its ledger rows. */
function LedgerTrend({ month, granularity, currency }: { month: string; granularity: "daily" | "weekly"; currency: string }) {
  const { settings } = useSettings();
  const { rows, loading, monthLoaded } = useMonthExpenseRows(month);
  const todayKey = todayDateKey(settings.timezone);
  const points = useMemo(
    () =>
      granularity === "daily"
        ? dailySeries(rows, month, todayKey)
        : weeklySeries(rows, month, settings.firstDayOfWeek === "sunday" ? "sunday" : "monday", todayKey),
    [rows, month, todayKey, granularity, settings.firstDayOfWeek]
  );
  if (loading) return <DashboardSkeleton variant="section" rows={3} />;
  return (
    <>
      {!monthLoaded ? <DataNote>Still loading this month's older transactions — the bars may be incomplete.</DataNote> : null}
      <TrendCard
        points={points}
        title={granularity === "daily" ? "Daily spending" : "Weekly spending"}
        meta={monthLabel(month)}
        currency={currency}
        unit={granularity === "daily" ? "day" : "week"}
      />
    </>
  );
}

/** A bar chart of trend points plus their stats. Tap a bar to see its amount. */
function TrendCard({
  points,
  title,
  meta,
  currency,
  unit,
}: {
  points: TrendPoint[];
  title: string;
  meta: string;
  currency: string;
  unit: "day" | "week" | "month" | "year";
}) {
  const { theme } = useTheme();
  const money = useGhostMoney(currency);
  const stats = useMemo(() => seriesStats(points), [points]);
  const accent = theme.colors.primary;
  const lastWithData = [...points].reverse().find((p) => p.hasData)?.key;
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular };

  return (
    <>
      <SurfaceCard title={title} meta={meta}>
        {stats.pointsWithData === 0 ? (
          <DataNote>No spending recorded for this range yet.</DataNote>
        ) : (
          <>
            <BarChart
              data={points.map((p) => ({
                label: p.label,
                detailLabel: p.detailLabel,
                value: p.amount,
                color: p.key === lastWithData ? accent : withAlpha(accent, 0.3),
              }))}
              height={190}
              currency={currency}
              primaryLabel="Spent"
              primaryColor={accent}
              showLegend={false}
              showYAxis
            />
            <Text style={[styles.hint, muted]}>Tap a bar to see that {unit}'s total.</Text>
          </>
        )}
      </SurfaceCard>

      {stats.pointsWithData > 0 ? (
        <SurfaceCard title="Summary">
          <View style={styles.summaryRow}>
            {[
              {
                label: `vs previous ${unit}`,
                body: stats.change ? <TrendChip change={stats.change} subject={`This ${unit}`} /> : <Text style={[styles.cellValue, muted]}>—</Text>,
                meta: stats.change ? `${money(stats.change.previous)} in ${stats.change.from.detailLabel}` : `Needs two ${unit}s`,
              },
              {
                label: "Average",
                body: <FinancialAmount value={stats.average ?? 0} currency={currency} size="md" weight="bold" fit />,
                meta: `per ${unit}`,
              },
              {
                label: "Highest",
                body: <FinancialAmount value={stats.highest?.amount ?? 0} currency={currency} size="md" weight="bold" fit />,
                meta: stats.highest?.detailLabel ?? "",
              },
              {
                label: "Lowest",
                body: <FinancialAmount value={stats.lowest?.amount ?? 0} currency={currency} size="md" weight="bold" fit />,
                meta: stats.lowest?.detailLabel ?? "",
              },
            ].map((cell, i) => (
              <View
                key={cell.label}
                style={[styles.cell, i % 2 === 1 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: theme.colors.border }]}
              >
                <Text style={[styles.cellLabel, muted]}>{cell.label}</Text>
                {cell.body}
                <Text style={[styles.cellMeta, muted]} numberOfLines={1}>
                  {cell.meta}
                </Text>
              </View>
            ))}
          </View>
        </SurfaceCard>
      ) : null}
    </>
  );
}

/* --------------------------------------------------------------- Categories */

function CategoriesTab({
  month,
  current,
  previous,
  currency,
  onCategory,
}: {
  month: string;
  current: DashboardPeriodSummary | null;
  previous: DashboardPeriodSummary | null;
  currency: string;
  onCategory: (category: string) => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const moves = useMemo(() => categoryMovements(current?.categoryTotals, previous?.categoryTotals), [current, previous]);
  if (moves.length === 0) {
    return (
      <EmptyState
        illustration="analytics"
        title={`No spending in ${monthLabel(month, "long")}`}
        description="Category changes appear once there is spending to compare."
      />
    );
  }
  return (
    <SurfaceCard title="By category" meta={previous ? `vs ${monthLabel(shiftMonthKey(month, -1))}` : "No earlier month"}>
      {moves.map((m, i) => {
        const up = m.delta > 0;
        const color = m.delta === 0 ? theme.colors.mutedForeground : up ? theme.colors.destructive : theme.colors.success;
        const change =
          !previous
            ? "No earlier month to compare"
            : m.pct === null
              ? "New this month"
              : m.amount === 0
                ? "Nothing this month"
                : `${up ? "↑" : m.delta < 0 ? "↓" : ""} ${Math.abs(Math.round(m.pct))}% vs last month`;
        return (
          <Pressable
            key={m.category}
            onPress={() => {
              void haptic.selection();
              onCategory(m.category);
            }}
            android_ripple={{ color: surfaces.control, borderless: false }}
            style={({ pressed }) => [
              styles.moveRow,
              i < moves.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${m.category}: ${Math.round(m.amount)} this month. ${change}. Open category`}
          >
            <CategoryIcon category={m.category} color={spendingSliceColor(i, m.category, theme.colors, "")} size={40} />
            <View style={styles.moveBody}>
              <Text style={[styles.moveName, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]} numberOfLines={1}>
                {m.category}
              </Text>
              <Text style={[styles.moveMeta, { color: previous && m.pct !== null ? color : theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}>
                {change}
              </Text>
            </View>
            <FinancialAmount value={m.amount} currency={currency} size="sm" weight="semibold" />
            <ChevronRight size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} />
          </Pressable>
        );
      })}
    </SurfaceCard>
  );
}

/* --------------------------------------------------------------- Comparison */

function ComparisonTab({
  month,
  summaries,
  total,
  currency,
}: {
  month: string;
  summaries: DashboardPeriodSummary[];
  total: number;
  currency: string;
}) {
  const { theme } = useTheme();
  const money = useGhostMoney(currency);
  const byMonth = new Map(summaries.map((s) => [s.period, s]));
  const lastMonth = shiftMonthKey(month, -1);
  const lastYear = shiftMonthKey(month, -12);
  const earlier = monthlySpendSeries(summaries, lastMonth, 6).filter((p) => p.hasData && p.amount > 0);
  const average = earlier.length >= MIN_HISTORY_MONTHS ? earlier.reduce((s, p) => s + p.amount, 0) / earlier.length : null;

  const rows = [
    {
      key: "mom",
      title: "Month over month",
      baseline: `${monthLabel(month)} against ${monthLabel(lastMonth)}`,
      base: byMonth.has(lastMonth) ? categorizedSpendTotal(byMonth.get(lastMonth)!.categoryTotals) : null,
      missing: `No spending recorded in ${monthLabel(lastMonth, "long")}.`,
    },
    {
      key: "yoy",
      title: "Year over year",
      baseline: `${monthLabel(month)} against ${monthLabel(lastYear)}`,
      base: byMonth.has(lastYear) ? categorizedSpendTotal(byMonth.get(lastYear)!.categoryTotals) : null,
      missing: `No spending recorded in ${monthLabel(lastYear, "long")}.`,
    },
    {
      key: "avg",
      title: "Against your average",
      baseline: `${monthLabel(month)} against the ${earlier.length}-month average before it`,
      base: average,
      missing: `Needs at least ${MIN_HISTORY_MONTHS} earlier months with spending.`,
    },
  ];
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular };

  return (
    <SurfaceCard title="Comparisons" meta="Total spending">
      {rows.map((row, i) => {
        const cmp = spendComparison(total, row.base);
        return (
          <View
            key={row.key}
            style={[styles.compareRow, i < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }]}
          >
            <View style={styles.compareTop}>
              <Text style={[styles.moveName, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>{row.title}</Text>
              {cmp ? <TrendChip change={cmp} subject={row.title} /> : null}
            </View>
            {cmp ? (
              <>
                <View style={styles.compareFigures}>
                  <FinancialAmount value={total} currency={currency} size="md" weight="bold" />
                  <Text style={[styles.moveMeta, muted]}>{`vs ${money(cmp.previous)}`}</Text>
                  <Text style={[styles.moveMeta, { color: cmp.delta > 0 ? theme.colors.destructive : theme.colors.success, fontFamily: theme.fontFamily.medium }]}>
                    {`${cmp.delta > 0 ? "+" : "−"}${money(Math.abs(cmp.delta))}`}
                  </Text>
                </View>
                <Text style={[styles.moveMeta, muted]}>{row.baseline}</Text>
              </>
            ) : (
              <Text style={[styles.moveMeta, muted]}>{row.missing}</Text>
            )}
          </View>
        );
      })}
    </SurfaceCard>
  );
}

/* ----------------------------------------------------------------- Insights */

function InsightsTab({ month, summaries }: { month: string; summaries: DashboardPeriodSummary[] }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();
  const currency = useDisplayCurrency();
  const money = useGhostMoney(currency);
  const { rows, loading } = useMonthExpenseRows(month);
  const weeks = useMemo(
    () => weeklySeries(rows, month, settings.firstDayOfWeek === "sunday" ? "sunday" : "monday", todayDateKey(settings.timezone)),
    [rows, month, settings.firstDayOfWeek, settings.timezone]
  );
  const { insights, insufficientHistory } = useMemo(
    () => trendInsights({ summaries, month, weeks, formatMoney: money }),
    [summaries, month, weeks, money]
  );
  if (loading) return <DashboardSkeleton variant="section" rows={3} />;
  return (
    <>
      {insights.length > 0 ? (
        <SurfaceCard title="Key insights">
          {insights.map((insight, index) => {
            const Icon = insight.tone === "up" ? TrendingUp : insight.tone === "down" ? TrendingDown : Lightbulb;
            const color = insight.tone === "up" ? theme.colors.destructive : insight.tone === "down" ? theme.colors.success : theme.colors.info;
            return (
              <View
                key={insight.id}
                style={[styles.insightRow, index < insights.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }]}
              >
                <RowGlyph tint={surfaces.wash(color)}>
                  <Icon size={16} color={color} />
                </RowGlyph>
                <View style={styles.moveBody}>
                  <Text style={[styles.moveName, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>{insight.title}</Text>
                  <Text style={[styles.insightBody, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
                    {insight.body}
                  </Text>
                </View>
              </View>
            );
          })}
        </SurfaceCard>
      ) : (
        <EmptyState
          illustration="analytics"
          compact
          title="Not enough history yet"
          description="Insights appear once there are earlier months to compare with."
        />
      )}
      {insufficientHistory ? (
        <DataNote>{`Averages and trends need at least ${MIN_HISTORY_MONTHS} earlier months with spending, so some insights are not shown yet.`}</DataNote>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  pressed: { opacity: 0.8 },
  heroIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  hint: { fontSize: 12, textAlign: "center" },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", rowGap: 14 },
  cell: { width: "50%", paddingHorizontal: 10, gap: 4, alignItems: "flex-start" },
  cellLabel: { fontSize: 12.5 },
  cellValue: { fontSize: 18 },
  cellMeta: { fontSize: 12 },
  moveRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, minHeight: 60 },
  moveBody: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", gap: 2 },
  moveName: { fontSize: 14.5 },
  moveMeta: { fontSize: 12.5, fontVariant: ["tabular-nums"] },
  compareRow: { paddingVertical: 12, gap: 6 },
  compareTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  compareFigures: { flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" },
  insightRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12 },
  insightBody: { fontSize: 13, lineHeight: 18 },
});
