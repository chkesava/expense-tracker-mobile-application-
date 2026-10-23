import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Lightbulb, TrendingDown, TrendingUp } from "lucide-react-native";

import { DonutChart } from "@/components/charts/DonutChart";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { ProgressIndicator, type ProgressStatus } from "@/components/dashboard/ProgressIndicator";
import { DataRow, RowGlyph, useSurfaces } from "@/components/dashboard/primitives";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { spendingSliceColor } from "@/components/spending/palette";
import {
  BreakdownCard,
  CalloutCard,
  CategoryIcon,
  DataNote,
  DrilldownTabs,
  DrilldownTopBar,
  SpendingHero,
  SurfaceCard,
} from "@/components/spending/SpendingParts";
import { SpendingTrendPanel, TransactionComparisonCards } from "@/components/spending/SpendingTrendPanel";
import { SpendingTransactionList } from "@/components/spending/SpendingTransactionList";
import { Button } from "@/components/ui/Button";
import { useCategoryBudgets } from "@/hooks/useCategoryBudgets";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useExpenses } from "@/hooks/useExpenses";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useMonthExpenseRows, useSpendingSummaries } from "@/hooks/useSpendingDrilldown";
import { haptic } from "@/lib/haptics";
import { useGlobalMonth } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import type { DashboardPeriodSummary } from "@/shared/types/financialSummary";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { computeActiveCategoryBudgets } from "@/shared/utils/dashboardWidgets";
import { currentMonthKey, shiftMonthKey } from "@/shared/utils/dates";
import { monthLabel } from "@/shared/utils/monthLabel";
import {
  CATEGORY_DETAIL_TABS,
  categorySpendSummary,
  comparisonCallout,
  decodeCategoryParam,
  monthlySpendSeries,
  resolveSpendingMonth,
  resolveSpendingTab,
  spendComparison,
  spendingInsights,
  totalSpendingHref,
  type CategoryDetailTab,
  type CategorySpendSummary,
} from "@/shared/utils/spendingDrilldown";
import { useTheme } from "@/theme/ThemeProvider";

const TABS: Array<{ id: CategoryDetailTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "transactions", label: "Transactions" },
  { id: "budget", label: "Budget" },
  { id: "insights", label: "Insights" },
];

/**
 * SPENDLY-574 — one category's month, opened from a Spending Overview legend
 * row or slice (or the Total Spending ranking). The route carries the stored
 * category key and the month; totals and the subcategory split come from the
 * same `dashboard_{YYYY-MM}` summary the dashboard donut reads, and the
 * transactions are ledger rows under the same inclusion rule.
 */
export default function CategoryDetailScreen() {
  const params = useLocalSearchParams<{ category?: string; month?: string; tab?: string; sub?: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const { settings } = useSettings();
  const { globalMonth } = useGlobalMonth();
  const currency = useDisplayCurrency();
  const money = useGhostMoney(currency);
  const { isFromCache } = useExpenses();

  const category = decodeCategoryParam(params.category);
  const thisMonth = currentMonthKey(settings.timezone);
  const month = resolveSpendingMonth(params.month, globalMonth || thisMonth);
  const tab = resolveSpendingTab(params.tab, CATEGORY_DETAIL_TABS, "overview");
  const { summaries, current, previous, loading, error } = useSpendingSummaries(month, 6);

  const detail = useMemo(
    () => categorySpendSummary(current?.categoryTotals, category ?? ""),
    [current, category]
  );
  const comparison = spendComparison(
    detail.total,
    previous && category ? previous.categoryTotals?.[category] ?? 0 : null
  );

  const goBack = () => (router.canGoBack() ? router.back() : router.replace(totalSpendingHref(month, "categories") as Href));
  const setMonth = (next: string) => router.setParams({ month: next });
  const setTab = (next: CategoryDetailTab) => router.setParams({ tab: next });
  const title = category ?? "Category";

  const header = <DrilldownTopBar onBack={goBack} month={month} maxMonth={thisMonth} onChangeMonth={setMonth} />;

  if (!category) {
    return (
      <PageShell contentContainerStyle={styles.content}>
        {header}
        <EmptyState
          illustration="analytics"
          title="Category not found"
          description="This link doesn't name a category."
          primaryAction={{ label: "See all categories", onPress: () => router.replace(totalSpendingHref(month, "categories") as Href) }}
        />
      </PageShell>
    );
  }

  if (error && !current) {
    return (
      <PageShell contentContainerStyle={styles.content}>
        {header}
        <ErrorState title="Couldn't load this category" description={error.message} />
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
            testID="category-detail-hero"
            icon={<CategoryIcon category={category} color={theme.colors.primary} size={52} />}
            title={category}
            caption={
              detail.total > 0
                ? `${Math.round(detail.shareOfTotal)}% of total spending · ${monthLabel(month)}`
                : `Nothing spent · ${monthLabel(month)}`
            }
            amount={detail.total}
            currency={currency}
            change={comparison}
            previousLabel={comparison ? `${money(comparison.previous)} last month` : undefined}
          />

          <DrilldownTabs tabs={TABS} value={tab} onChange={setTab} />

          {isFromCache ? <DataNote offline>You're offline — showing the figures saved on this device.</DataNote> : null}

          {tab === "overview" ? (
            <OverviewTab
              category={category}
              month={month}
              detail={detail}
              summaries={summaries}
              currency={currency}
              callout={comparisonCallout(category, detail.total, comparison?.previous, monthLabel(shiftMonthKey(month, -1), "long"))}
              onPickSubcategory={(sub) => router.setParams({ tab: "transactions", sub })}
              onOpenInsights={() => setTab("insights")}
            />
          ) : tab === "transactions" ? (
            <TransactionsTab category={category} month={month} detail={detail} currency={currency} initialSub={typeof params.sub === "string" ? params.sub : null} />
          ) : tab === "budget" ? (
            <BudgetTab category={category} month={month} current={current} currency={currency} />
          ) : (
            <InsightsTab category={category} month={month} detail={detail} summaries={summaries} currency={currency} />
          )}
        </>
      )}
    </PageShell>
  );
}

function OverviewTab({
  category,
  month,
  detail,
  summaries,
  currency,
  callout,
  onPickSubcategory,
  onOpenInsights,
}: {
  category: string;
  month: string;
  detail: CategorySpendSummary;
  summaries: DashboardPeriodSummary[];
  currency: string;
  callout: ReturnType<typeof comparisonCallout>;
  onPickSubcategory: (sub: string) => void;
  onOpenInsights: () => void;
}) {
  const { theme } = useTheme();
  const money = useGhostMoney(currency);

  return (
    <>
      {detail.total > 0 ? (
        <BreakdownCard
          title="Breakdown"
          items={detail.subcategories.map((sub, i) => ({
            key: sub.key,
            label: sub.label,
            amount: sub.amount,
            percentage: sub.percentage,
            color: spendingSliceColor(i, sub.label, theme.colors, ""),
          }))}
          currency={currency}
          formatMoney={money}
          shareOf={`of ${category}`}
          onPick={(index) => {
            const sub = detail.subcategories[index];
            if (sub) onPickSubcategory(sub.key);
          }}
        />
      ) : (
        <EmptyState
          illustration="analytics"
          compact
          title={`No ${category} spending in ${monthLabel(month, "long")}`}
          description="Pick another month, or record an expense in this category."
        />
      )}

      <SpendingTrendPanel summaries={summaries} month={month} category={category} currency={currency} />

      <TransactionComparisonCards month={month} category={category} currency={currency} />

      {callout ? <CalloutCard title={callout.title} body={callout.body} onPress={onOpenInsights} /> : null}
    </>
  );
}

function TransactionsTab({
  category,
  month,
  detail,
  currency,
  initialSub,
}: {
  category: string;
  month: string;
  detail: CategorySpendSummary;
  currency: string;
  initialSub: string | null;
}) {
  const { rows, loading, monthLoaded } = useMonthExpenseRows(month, category);
  const { theme } = useTheme();
  const options = detail.subcategories.map((sub, i) => ({
    value: sub.key,
    label: sub.label,
    color: spendingSliceColor(i, sub.label, theme.colors, ""),
  }));
  const validInitial = initialSub && options.some((o) => o.value === initialSub) ? initialSub : null;
  return (
    <SpendingTransactionList
      key={validInitial ?? "all"}
      rows={rows}
      loading={loading}
      monthLoaded={monthLoaded}
      summaryTotal={detail.total}
      currency={currency}
      filterLabel="Subcategory"
      filterOptions={options}
      filterKey="subcategory"
      initialFilter={validInitial}
      emptyTitle={`No ${category} expenses this month`}
    />
  );
}

function budgetStatus(spent: number, amount: number): ProgressStatus {
  if (spent > amount) return "over";
  if (amount > 0 && spent / amount >= 0.8) return "watch";
  return "good";
}

function BudgetTab({
  category,
  month,
  current,
  currency,
}: {
  category: string;
  month: string;
  current: DashboardPeriodSummary | null;
  currency: string;
}) {
  const router = useRouter();
  const { theme } = useTheme();
  // Mounted only on this tab (SPENDLY-406); the subscription is the shared,
  // ref-counted reference-data one the dashboard card also uses.
  const { budgets, loading, error, retry } = useCategoryBudgets();
  const items = useMemo(
    () =>
      computeActiveCategoryBudgets(budgets ?? [], current?.categoryTotals ?? {}, month).filter(
        (b) => b.category === category
      ),
    [budgets, current, month, category]
  );
  const openBudgets = () => router.push("/settings/money" as Href);

  if (loading && items.length === 0) return <DashboardSkeleton variant="section" rows={3} />;
  if (error) {
    return <ErrorState title="Couldn't load budgets" description={error.message} onRetry={retry} />;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        illustration="budgets"
        title={`No budget for ${category} in ${monthLabel(month, "long")}`}
        description="Set a category budget to see how much is left and get alerts before you overspend."
        primaryAction={{ label: "Set a budget", onPress: openBudgets }}
      />
    );
  }

  const parent = items.find((b) => !b.subcategory);
  const subs = items.filter((b) => b.subcategory);
  return (
    <>
      {parent ? (
        <SurfaceCard title="Category budget">
          <BudgetLine label={category} amount={parent.amount} spent={parent.spent} currency={currency} />
        </SurfaceCard>
      ) : null}
      {subs.length > 0 ? (
        <SurfaceCard title="Subcategory budgets">
          <View style={styles.budgetList}>
            {subs.map((b) => (
              <BudgetLine key={b.id} label={b.subcategory ?? ""} amount={b.amount} spent={b.spent} currency={currency} />
            ))}
          </View>
        </SurfaceCard>
      ) : null}
      <Button variant="outline" onPress={openBudgets}>
        Manage budgets
      </Button>
    </>
  );
}

function BudgetLine({ label, amount, spent, currency }: { label: string; amount: number; spent: number; currency: string }) {
  const { theme } = useTheme();
  const money = useGhostMoney(currency);
  const remaining = amount - spent;
  const over = remaining < 0;
  const status = budgetStatus(spent, amount);
  const pct = amount > 0 ? (spent / amount) * 100 : 0;
  return (
    <View style={styles.budgetLine} accessible accessibilityLabel={`${label}: spent ${money(spent)} of ${money(amount)}. ${over ? `Over by ${money(-remaining)}` : `${money(remaining)} left`}`}>
      <View style={styles.budgetTop}>
        <Text style={[styles.budgetLabel, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.budgetFigure, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
          {`${money(spent)} of ${money(amount)}`}
        </Text>
      </View>
      <ProgressIndicator pct={Math.min(100, pct)} status={status} height={8} />
      <Text
        style={[
          styles.budgetState,
          { color: over ? theme.colors.destructive : status === "watch" ? theme.colors.warning : theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium },
        ]}
      >
        {over ? `Over budget by ${money(-remaining)}` : `${money(remaining)} left · ${Math.round(pct)}% used`}
      </Text>
    </View>
  );
}

function InsightsTab({
  category,
  month,
  detail,
  summaries,
  currency,
}: {
  category: string;
  month: string;
  detail: CategorySpendSummary;
  summaries: DashboardPeriodSummary[];
  currency: string;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();
  const money = useGhostMoney(currency);
  const { rows, loading } = useMonthExpenseRows(month, category);
  const series = useMemo(() => monthlySpendSeries(summaries, month, 6, category), [summaries, month, category]);
  const { insights, insufficientHistory } = useMemo(
    () =>
      spendingInsights({
        label: category,
        series,
        rows,
        subcategories: detail.subcategories,
        formatMoney: money,
        formatDate: (d) => formatDisplayDate(d, settings?.dateFormat),
      }),
    [category, series, rows, detail.subcategories, money, settings?.dateFormat]
  );

  if (loading) return <DashboardSkeleton variant="section" rows={3} />;

  return (
    <>
      {insights.length > 0 ? (
        <SurfaceCard title="What stands out">
          {insights.map((insight, index) => {
            const Icon = insight.tone === "up" ? TrendingUp : insight.tone === "down" ? TrendingDown : Lightbulb;
            const color = insight.tone === "up" ? theme.colors.destructive : insight.tone === "down" ? theme.colors.success : theme.colors.info;
            return (
              <View
                key={insight.id}
                style={[
                  styles.insightRow,
                  index < insights.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
                ]}
              >
                <RowGlyph tint={surfaces.wash(color)}>
                  <Icon size={16} color={color} />
                </RowGlyph>
                <View style={styles.insightText}>
                  <Text style={[styles.insightTitle, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
                    {insight.title}
                  </Text>
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
          title="Nothing to point out yet"
          description={`Insights appear once ${category} has enough spending to compare.`}
        />
      )}
      {insufficientHistory ? (
        <DataNote>Averages need at least three earlier months with spending in this category, so they're not shown yet.</DataNote>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  insightRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12 },
  insightText: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", gap: 3 },
  insightTitle: { fontSize: 14.5 },
  insightBody: { fontSize: 13, lineHeight: 18 },
  content: { gap: 14 },
  headerEmoji: { fontSize: 20 },
  heroEmoji: { fontSize: 30 },
  muted: { fontSize: 13, lineHeight: 18 },
  breakdown: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 12 },
  legend: { flex: 1, minWidth: 150, gap: 0 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 4, borderRadius: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: 12.5 },
  legendPct: { fontSize: 12.5, fontVariant: ["tabular-nums"] },
  budgetList: { gap: 16 },
  budgetLine: { gap: 6 },
  budgetTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  budgetLabel: { flex: 1, fontSize: 14.5 },
  budgetFigure: { fontSize: 12.5, fontVariant: ["tabular-nums"] },
  budgetState: { fontSize: 12.5 },
});
